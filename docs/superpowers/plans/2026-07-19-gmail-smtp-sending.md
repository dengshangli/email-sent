# Gmail SMTP Sending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Resend with Gmail SMTP so the platform can send isolated HTML emails to valid addresses on any recipient domain without requiring a custom sending domain.

**Architecture:** The existing `/api/send` contract remains unchanged. A Nodemailer transporter authenticates to `smtp.gmail.com` with a Gmail address and app password, and the route sends one SMTP envelope per recipient in sequence. The UI reports “SMTP accepted” rather than claiming inbox delivery and surfaces partial failures without exposing credentials or raw SMTP responses.

**Tech Stack:** Next.js 16.2.10, React 19.2.7, TypeScript 5.9, Nodemailer, Node.js test runner, Playwright, pnpm 10.14.0.

## Global Constraints

- Preserve the existing uncommitted simplification changes in `README.md`, `e2e/email-sender.spec.ts`, `src/app/layout.tsx`, and `src/components/email-sender.tsx`; never revert or overwrite them.
- Do not edit `next-env.d.ts`; Next.js owns that generated file.
- Use `SMTP_USER`, `SMTP_APP_PASSWORD`, and `EMAIL_FROM_NAME`; never log, return, or commit credentials.
- Keep the existing request validation: 1–50 unique recipients, non-empty subject and HTML, and a 1 MB UTF-8 HTML limit.
- Send one independent SMTP envelope per recipient; the application must not expose recipient addresses to one another.
- Personal Gmail remains subject to approximately 500 messages or recipients per day and provider anti-abuse controls.
- No OAuth, generic provider abstraction, queue, retry worker, account pool, or React Email public relay integration.
- Before implementation, query the current Nodemailer documentation through Context7 as required by `AI-WORKFLOW.md`.
- Develop with TDD, request code review after each task, and run Playwright after implementation.

---

### Task 1: Gmail SMTP route and isolated delivery

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/app/api/send/route.ts`
- Modify: `src/lib/send-route.test.ts`

**Interfaces:**
- Consumes: `validateSendRequest(body)` from `src/lib/send-request.ts`.
- Produces: `createPost(sendMail?)`, where `sendMail` accepts `{ from: { name: string; address: string }; to: string; subject: string; html: string }` and resolves to `{ accepted?: unknown[]; rejected?: unknown[] }`.
- Produces: `POST(request)` for Next.js.
- Success response: `{ ok: true, acceptedCount: number, failedRecipients: [] }`.
- Partial response: `{ ok: false, acceptedCount: number, failedRecipients: string[], error: string }` with HTTP 207.

- [ ] **Step 1: Install the smallest SMTP dependency**

Run:

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Expected: `package.json` contains `nodemailer`; `pnpm-lock.yaml` changes only through pnpm.

- [ ] **Step 2: Replace Resend tests with failing SMTP contract tests**

In `src/lib/send-route.test.ts`, retain the malformed JSON test and replace Resend-specific setup with an environment helper:

```ts
import { createPost, POST } from "../app/api/send/route.ts";

async function withSmtpConfig(run: () => Promise<void>) {
  const previousUser = process.env.SMTP_USER;
  const previousPassword = process.env.SMTP_APP_PASSWORD;
  const previousName = process.env.EMAIL_FROM_NAME;
  process.env.SMTP_USER = "sender@gmail.com";
  process.env.SMTP_APP_PASSWORD = "app-password";
  process.env.EMAIL_FROM_NAME = "邮件发送平台";

  try {
    await run();
  } finally {
    if (previousUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = previousUser;
    if (previousPassword === undefined) delete process.env.SMTP_APP_PASSWORD;
    else process.env.SMTP_APP_PASSWORD = previousPassword;
    if (previousName === undefined) delete process.env.EMAIL_FROM_NAME;
    else process.env.EMAIL_FROM_NAME = previousName;
  }
}

function validRequest(recipients: string[]) {
  return new Request("http://localhost/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipients, subject: "测试邮件", html: "<h1>测试</h1>" }),
  });
}
```

Add exact assertions for:

```ts
test("通过独立 SMTP 信封逐个发送", async () => {
  const messages: unknown[] = [];
  const post = createPost(async (message) => {
    messages.push(message);
    return { accepted: [message.to], rejected: [] };
  });

  await withSmtpConfig(async () => {
    const response = await post(validRequest(["a@gmail.com", "b@163.com"]));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      acceptedCount: 2,
      failedRecipients: [],
    });
    assert.deepEqual(messages, [
      {
        from: { name: "邮件发送平台", address: "sender@gmail.com" },
        to: "a@gmail.com",
        subject: "测试邮件",
        html: "<h1>测试</h1>",
      },
      {
        from: { name: "邮件发送平台", address: "sender@gmail.com" },
        to: "b@163.com",
        subject: "测试邮件",
        html: "<h1>测试</h1>",
      },
    ]);
  });
});

test("单个收件人失败后继续发送并返回部分结果", async () => {
  const attempted: string[] = [];
  const post = createPost(async (message) => {
    attempted.push(message.to);
    if (message.to === "bad@163.com") throw Object.assign(new Error("secret"), { code: "EENVELOPE" });
    return { accepted: [message.to], rejected: [] };
  });

  await withSmtpConfig(async () => {
    const response = await post(validRequest(["ok@gmail.com", "bad@163.com", "ok@qq.com"]));
    assert.equal(response.status, 207);
    assert.deepEqual(await response.json(), {
      ok: false,
      acceptedCount: 2,
      failedRecipients: ["bad@163.com"],
      error: "部分邮件未被服务器接受，请检查失败地址后重试。",
    });
    assert.deepEqual(attempted, ["ok@gmail.com", "bad@163.com", "ok@qq.com"]);
  });
});
```

Add the remaining error assertions:

```ts
test("缺少 Gmail SMTP 配置时返回脱敏中文错误", async () => {
  const previousUser = process.env.SMTP_USER;
  const previousPassword = process.env.SMTP_APP_PASSWORD;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_APP_PASSWORD;
  try {
    const response = await POST(validRequest(["a@gmail.com"]));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "邮件服务尚未配置，请检查 Gmail SMTP 环境变量。",
    });
  } finally {
    if (previousUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = previousUser;
    if (previousPassword === undefined) delete process.env.SMTP_APP_PASSWORD;
    else process.env.SMTP_APP_PASSWORD = previousPassword;
  }
});

test("Gmail 认证失败时提示应用专用密码且不泄露底层错误", async () => {
  const post = createPost(async () => {
    throw Object.assign(new Error("secret smtp response"), { code: "EAUTH" });
  });
  await withSmtpConfig(async () => {
    const response = await post(validRequest(["a@gmail.com"]));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, "Gmail 认证失败，请检查两步验证和应用专用密码。");
    assert.equal(JSON.stringify(body).includes("secret smtp response"), false);
  });
});

test("Gmail 额度受限时返回 429", async () => {
  const post = createPost(async () => {
    throw Object.assign(new Error("Daily quota exceeded"), { responseCode: 454 });
  });
  await withSmtpConfig(async () => {
    const response = await post(validRequest(["a@gmail.com"]));
    assert.equal(response.status, 429);
    assert.equal(
      (await response.json()).error,
      "Gmail 发送额度已用完或暂时受限，请稍后重试。",
    );
  });
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm test
```

Expected: FAIL because `createPost` is not exported and the route still expects Resend variables.

- [ ] **Step 4: Implement the minimal Gmail SMTP route**

Replace the Resend client in `src/app/api/send/route.ts` with Nodemailer and an injectable handler:

```ts
import nodemailer from "nodemailer";
import { validateSendRequest } from "../../../lib/send-request.ts";

type Mail = {
  from: { name: string; address: string };
  to: string;
  subject: string;
  html: string;
};
type SendMail = (mail: Mail) => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
let transporterKey = "";

function defaultSendMail(user: string, password: string): SendMail {
  const key = `${user}\0${password}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: password },
    });
    transporterKey = key;
  }
  return (mail) => transporter!.sendMail(mail);
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function errorResponseCode(error: unknown) {
  return typeof error === "object" && error !== null && "responseCode" in error
    ? Number((error as { responseCode?: unknown }).responseCode)
    : 0;
}

function errorText(error: unknown) {
  if (typeof error !== "object" || error === null) return "";
  const value = error as { message?: unknown; response?: unknown };
  return `${String(value.message ?? "")} ${String(value.response ?? "")}`;
}

function failure(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export function createPost(injectedSendMail?: SendMail) {
  return async function post(request: Request) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure("请求格式不正确。", 400);
    }

    const validation = validateSendRequest(body);
    if (!validation.ok) return failure(validation.error, 400);

    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_APP_PASSWORD;
    const name = process.env.EMAIL_FROM_NAME?.trim() || "邮件发送平台";
    if (!user || !password) {
      return failure("邮件服务尚未配置，请检查 Gmail SMTP 环境变量。", 500);
    }

    const sendMail = injectedSendMail ?? defaultSendMail(user, password);
    const { recipients, subject, html } = validation.value;
    const failedRecipients: string[] = [];
    let acceptedCount = 0;

    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];
      try {
        const result = await sendMail({
          from: { name, address: user },
          to: recipient,
          subject,
          html,
        });
        if ((result.accepted?.length ?? 0) > 0 && (result.rejected?.length ?? 0) === 0) {
          acceptedCount += 1;
        } else {
          failedRecipients.push(recipient);
        }
      } catch (error) {
        const remaining = recipients.slice(index);
        if (errorCode(error) === "EAUTH") {
          return Response.json(
            {
              ok: false,
              acceptedCount,
              failedRecipients: [...failedRecipients, ...remaining],
              error: "Gmail 认证失败，请检查两步验证和应用专用密码。",
            },
            { status: 502 },
          );
        }
        if (errorCode(error) === "EENVELOPE") {
          failedRecipients.push(recipient);
          continue;
        }
        if (
          [421, 450, 451, 452, 454].includes(errorResponseCode(error)) ||
          /quota|rate|limit|too many/i.test(errorText(error))
        ) {
          return Response.json(
            {
              ok: false,
              acceptedCount,
              failedRecipients: [...failedRecipients, ...remaining],
              error: "Gmail 发送额度已用完或暂时受限，请稍后重试。",
            },
            { status: 429 },
          );
        }
        return Response.json(
          {
            ok: false,
            acceptedCount,
            failedRecipients: [...failedRecipients, ...remaining],
            error: "邮件发送失败，请稍后重试。",
          },
          { status: 502 },
        );
      }
    }

    if (failedRecipients.length > 0) {
      return Response.json(
        {
          ok: false,
          acceptedCount,
          failedRecipients,
          error: "部分邮件未被服务器接受，请检查失败地址后重试。",
        },
        { status: 207 },
      );
    }

    return Response.json({ ok: true, acceptedCount, failedRecipients: [] });
  };
}

export const POST = createPost();
```

The implementation above uses Nodemailer's structured address object so the display name cannot alter the address header. It treats a resolved result with an empty `accepted` array or a non-empty `rejected` array as a failed recipient and never returns `error.message`.

- [ ] **Step 5: Run route tests and verify GREEN**

Run:

```bash
pnpm test
```

Expected: all parser, request-validation, and SMTP route tests PASS with zero failures.

- [ ] **Step 6: Request review and commit only backend files**

Run the `code-review` skill on the Task 1 diff, fix findings to a fixed point, then:

```bash
git add package.json pnpm-lock.yaml src/app/api/send/route.ts src/lib/send-route.test.ts
git commit -m "feat: send email through Gmail SMTP"
```

### Task 2: Honest UI status and partial failures

**Files:**
- Modify: `src/components/email-sender.tsx`
- Modify: `e2e/email-sender.spec.ts`

**Interfaces:**
- Consumes: Task 1 response union with `acceptedCount`, `failedRecipients`, and optional `error`.
- Produces: Chinese success text `邮件服务器已接受 N 封邮件。` and partial-failure text that includes accepted count and failed addresses.

- [ ] **Step 1: Update the existing Playwright test first**

Preserve the current upload-only UI test. Change the intercepted first response to:

```ts
body: JSON.stringify({ ok: true, acceptedCount: 2, failedRecipients: [] }),
```

Assert:

```ts
await expect(
  page.getByRole("alert").filter({ hasText: "邮件服务器已接受 2 封邮件" }),
).toBeVisible();
```

Return a partial result on the next request:

```ts
status: 207,
body: JSON.stringify({
  ok: false,
  acceptedCount: 1,
  failedRecipients: ["b@163.com"],
  error: "部分邮件未被服务器接受，请检查失败地址后重试。",
}),
```

Assert the alert contains both `服务器已接受 1 封` and `b@163.com`.

- [ ] **Step 2: Run Playwright and verify RED**

Run:

```bash
pnpm test:e2e
```

Expected: FAIL because the component still reads `count` and says `已成功发送`.

- [ ] **Step 3: Update the response handling and SMTP copy**

In `src/components/email-sender.tsx`, replace the response type and notice construction:

```ts
type SendResult = {
  ok: boolean;
  acceptedCount?: number;
  failedRecipients?: string[];
  error?: string;
};

const result = (await response.json()) as SendResult;
const acceptedCount = result.acceptedCount ?? 0;
const failedRecipients = result.failedRecipients ?? [];

if (!result.ok) {
  const failedText = failedRecipients.length
    ? ` 失败地址：${failedRecipients.join("、")}。`
    : "";
  setNotice({
    type: "error",
    text: `${acceptedCount ? `邮件服务器已接受 ${acceptedCount} 封；` : ""}${result.error || "邮件发送失败，请稍后重试。"}${failedText}`,
  });
  return;
}

setNotice({ type: "success", text: `邮件服务器已接受 ${acceptedCount} 封邮件。` });
```

Replace the Resend warning paragraph with:

```tsx
<p className="text-sm text-muted-foreground">
  使用 Gmail SMTP 逐封发送；邮件服务器接受后仍可能进入垃圾邮件或推广分类。
</p>
```

Do not restore the removed editor or preview UI; those uncommitted changes are the current baseline.

- [ ] **Step 4: Run Playwright and verify GREEN**

Run:

```bash
pnpm test:e2e
```

Expected: the upload, validation, sending state, accepted status, partial failure, and payload assertions all PASS.

- [ ] **Step 5: Review without absorbing unrelated user changes**

Run the `code-review` skill on the Task 2 hunk. Because both files were already modified before this task, inspect `git diff` carefully and do not claim or revert the pre-existing upload-only UI changes. Defer the commit until the owner chooses whether those baseline changes should be committed together.

### Task 3: Gmail configuration and documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `.env.local` (ignored local credential file; never stage)

**Interfaces:**
- Consumes: `SMTP_USER`, `SMTP_APP_PASSWORD`, and `EMAIL_FROM_NAME` from Task 1.
- Produces: a safe setup path that never overwrites an existing `.env.local`.

- [ ] **Step 1: Replace the checked-in environment example**

Set `.env.example` to:

```dotenv
SMTP_USER=
SMTP_APP_PASSWORD=
EMAIL_FROM_NAME=邮件发送平台
```

- [ ] **Step 2: Rewrite only the provider-specific README sections**

Preserve the current upload-only usage text. Replace Resend setup with:

```markdown
## 配置 Gmail SMTP

1. 为发件 Gmail 账号开启两步验证。
2. 在 Google 账号的「应用专用密码」页面创建一个 16 位密码。
3. 首次运行时执行 `test -e .env.local || cp .env.example .env.local`。
4. 在 `.env.local` 填写 `SMTP_USER`、`SMTP_APP_PASSWORD` 和 `EMAIL_FROM_NAME`，然后重启服务。

个人 Gmail 通常最多发送约 500 封或 500 个收件人/天。平台不限制收件邮箱域名，但 Gmail 仍可能因额度、退信或反垃圾策略拒绝邮件。
```

Update the introduction and real-delivery verification text to name Gmail SMTP instead of Resend. Do not include a real email address or app password.

- [ ] **Step 3: Run documentation and secret checks**

Run:

```bash
git diff --check
git check-ignore .env.local
git grep -n "SMTP_APP_PASSWORD=" -- ':!.env.example' || true
git grep -n "RESEND_API_KEY\|onboarding@resend.dev" -- .env.example README.md src e2e || true
```

Expected: no whitespace errors; `.env.local` is ignored; no credential value is tracked; no live Resend configuration or UI copy remains.

- [ ] **Step 4: Review and commit safe documentation files**

Run the `code-review` skill on `.env.example` and the provider-specific README hunk. Stage `.env.example`; stage README only after verifying its pre-existing upload-only edits are intentionally included or separately preserved.

```bash
git add .env.example
git commit -m "docs: configure Gmail SMTP sending"
```

Never add `.env.local`.

### Task 4: Full verification and real delivery

**Files:**
- Verify: all changed files
- Local only: `.env.local`

**Interfaces:**
- Consumes: completed Tasks 1–3 and a user-created Gmail app password.
- Produces: automated evidence plus one Gmail and one external-domain delivery result.

- [ ] **Step 1: Run all automated checks**

Run with Node.js 24:

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
git diff --check
```

Expected: zero lint errors, zero unit-test failures, Chromium E2E PASS, production build exit 0, and no whitespace errors.

- [ ] **Step 2: Configure the ignored local environment safely**

After the user creates an app password, set `SMTP_USER` to the authenticated Gmail address, set `SMTP_APP_PASSWORD` to the newly generated 16-character app password, and set `EMAIL_FROM_NAME` to `邮件发送平台` directly in `.env.local` without printing any value. Set permission `0600`, remove obsolete Resend variables from `.env.local`, and restart the development server.

- [ ] **Step 3: Perform narrow real-send confirmation**

With explicit recipient confirmation, send the same small HTML test once to the authenticated Gmail address and once to one external address such as 163. Confirm:

- The UI says the SMTP server accepted two messages.
- Both messages appear in Gmail「已发送」。
- Each SMTP envelope contains only one recipient.
- Each destination receives the message or has a provider-specific bounce/status that can be reported accurately.

- [ ] **Step 4: Final review, clean-state audit, and branch finish**

Use `superpowers:verification-before-completion`, run the `code-review` skill to a fixed point, and verify:

```bash
git status --short
git diff --check
git log --oneline -5
```

Report pre-existing uncommitted user changes separately. Then use `superpowers:finishing-a-development-branch` and offer merge, PR, keep, or discard without making the choice for the user.
