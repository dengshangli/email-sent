# 邮件发送平台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个中文单页邮件发送平台，支持上传、编辑和预览 HTML，并通过 Resend 向最多 50 个收件人分别发送邮件。

**Architecture:** Next.js App Router 提供单页客户端界面和一个服务端 Route Handler。浏览器使用原生文件 API、`textarea` 与无脚本权限的 `iframe` 完成编辑预览；服务端共享同一套校验函数，并用 `resend.batch.send()` 为每位收件人创建独立邮件，避免泄露邮箱地址。

**Tech Stack:** Next.js 16.2.9、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Resend Node.js SDK、Node.js 内置测试、Playwright 1.61。

## Global Constraints

- 所有面向用户的文字使用中文。
- 默认邮件标题固定为「测试邮件」，允许用户修改。
- HTML 文件与编辑后 HTML 的 UTF-8 大小上限均为 1 MB。
- 收件人支持英文逗号、中文逗号和换行分隔，去重后每次最多 50 个。
- 预览 `iframe` 不授予脚本执行权限。
- Resend API Key 只从服务端环境变量读取，任何响应都不得泄露密钥、堆栈或原始异常。
- 每个收件人必须收到独立邮件，不能在 `to` 字段中暴露其他人的地址。
- 不增加登录、数据库、发送历史、CSV、队列、富文本编辑器或部署功能。
- 每个任务完成后按 `AI-WORKFLOW.md` 调用 `code-review` 技能审查，再提交该任务。

---

## 文件结构

- `src/app/layout.tsx`：中文页面元数据和根布局。
- `src/app/page.tsx`：Server Component 页面入口，只组合邮件发送器。
- `src/app/globals.css`：Tailwind 与 shadcn/ui 全局主题。
- `src/app/api/send/route.ts`：解析、校验请求并调用 Resend 批量接口。
- `src/components/email-sender.tsx`：唯一 Client Component，负责上传、编辑、预览和发送交互。
- `src/components/ui/*`：由 shadcn/ui CLI 生成的基础组件。
- `src/lib/email-limits.ts`：1 MB 与 50 人两个共享边界值及 UTF-8 字节计算。
- `src/lib/recipients.ts`：收件人解析、去重与邮箱格式判断。
- `src/lib/send-request.ts`：服务端请求结构和信任边界校验。
- `src/lib/*.test.ts`：使用 Node.js 内置测试验证非 UI 逻辑。
- `e2e/email-sender.spec.ts`：浏览器交互与接口契约测试。
- `playwright.config.ts`：启动 Next.js 并运行 Chromium 测试。
- `.env.example`：无密钥的 Resend 配置示例。
- `README.md`：中文启动、配置和真实发送说明。

---

### Task 1: 建立最小 Next.js 与 shadcn/ui 应用

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `components.json`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/alert.tsx`
- Create: `src/components/ui/card.tsx`

**Interfaces:**
- Consumes: 已确认的中文单页规格，无代码依赖。
- Produces: 可运行的 Next.js App Router、`@/*` 路径别名、Tailwind 样式和上述 shadcn/ui 组件。

- [ ] **Step 1: 创建包清单**

```json
{
  "name": "email-sent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "test": "node --test --experimental-strip-types src/lib/*.test.ts",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "next": "16.2.9",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "resend": "^6.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.0",
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "16.2.9",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.0"
  },
  "engines": {
    "node": ">=24"
  },
  "packageManager": "pnpm@10.14.0"
}
```

- [ ] **Step 2: 安装依赖并生成锁文件**

Run: `pnpm install`

Expected: 命令退出码为 0，生成 `pnpm-lock.yaml`。

- [ ] **Step 3: 创建 Next.js、TypeScript、Tailwind 和 ESLint 配置**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "allowImportingTsExtensions": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`next-env.d.ts`：

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`next.config.ts`：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs`：

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`eslint.config.mjs`：

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "playwright-report/**", "test-results/**"]),
]);
```

- [ ] **Step 4: 创建最小页面骨架**

`src/app/globals.css`：

```css
@import "tailwindcss";

body {
  margin: 0;
  background: #f7f7f8;
  color: #18181b;
}
```

`src/app/layout.tsx`：

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "邮件发送平台",
  description: "上传、编辑、预览并发送 HTML 邮件",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`：

```tsx
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl items-center justify-center p-6">
      <h1 className="text-3xl font-semibold">邮件发送平台</h1>
    </main>
  );
}
```

- [ ] **Step 5: 初始化 shadcn/ui 并添加实际使用的组件**

Run:

```bash
pnpm dlx shadcn@latest init --defaults
pnpm dlx shadcn@latest add button input textarea label alert card --yes
```

Expected: 生成 `components.json`、`src/lib/utils.ts` 和六个 `src/components/ui/*.tsx` 文件；`src/app/globals.css` 保留 Tailwind 4 导入并加入主题变量。

- [ ] **Step 6: 验证基础应用**

Run: `pnpm lint && pnpm build`

Expected: 两个命令均退出码为 0，构建输出包含 `/` 静态页面。

- [ ] **Step 7: 请求任务级代码审查并提交**

调用 `code-review` 技能审查 Task 1，修复发现的问题后重新运行 `pnpm lint && pnpm build`。

```bash
git add package.json pnpm-lock.yaml tsconfig.json next-env.d.ts next.config.ts postcss.config.mjs eslint.config.mjs components.json src
git commit -m "chore: bootstrap email sending app"
```

---

### Task 2: 用测试驱动收件人解析与共享边界

**Files:**
- Create: `src/lib/email-limits.ts`
- Create: `src/lib/recipients.ts`
- Test: `src/lib/recipients.test.ts`

**Interfaces:**
- Consumes: Node.js 24 内置测试与 TypeScript 类型擦除。
- Produces: `MAX_RECIPIENTS`、`MAX_HTML_BYTES`、`getUtf8ByteLength(value)`、`parseRecipients(raw)` 和 `RecipientParseResult`。

- [ ] **Step 1: 写失败的收件人解析测试**

`src/lib/recipients.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_HTML_BYTES, getUtf8ByteLength } from "./email-limits.ts";
import { parseRecipients } from "./recipients.ts";

test("解析多种分隔符、忽略大小写去重并报告无效邮箱", () => {
  const result = parseRecipients(
    "Alice@example.com, bob@example.com，alice@example.com\n错误地址",
  );

  assert.deepEqual(result, {
    recipients: ["Alice@example.com", "bob@example.com"],
    invalid: ["错误地址"],
    exceedsLimit: false,
  });
});

test("超过 50 个唯一地址时报告超限", () => {
  const raw = Array.from({ length: 51 }, (_, index) => `user${index}@example.com`).join(",");
  assert.equal(parseRecipients(raw).exceedsLimit, true);
});

test("按 UTF-8 字节数检查 HTML 大小", () => {
  assert.equal(getUtf8ByteLength("你"), 3);
  assert.equal(getUtf8ByteLength("a".repeat(MAX_HTML_BYTES)), MAX_HTML_BYTES);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`

Expected: FAIL，提示找不到 `email-limits.ts` 或 `recipients.ts`。

- [ ] **Step 3: 写最小实现**

`src/lib/email-limits.ts`：

```ts
export const MAX_RECIPIENTS = 50;
export const MAX_HTML_BYTES = 1024 * 1024;

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
```

`src/lib/recipients.ts`：

```ts
import { MAX_RECIPIENTS } from "./email-limits.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RecipientParseResult = {
  recipients: string[];
  invalid: string[];
  exceedsLimit: boolean;
};

export function parseRecipients(raw: string): RecipientParseResult {
  const unique = [
    ...new Map(
      raw
        .split(/[,，\n]+/)
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => [email.toLowerCase(), email]),
    ).values(),
  ];

  return {
    recipients: unique.filter((email) => EMAIL_PATTERN.test(email)),
    invalid: unique.filter((email) => !EMAIL_PATTERN.test(email)),
    exceedsLimit: unique.length > MAX_RECIPIENTS,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test`

Expected: 3 tests PASS，0 tests FAIL。

- [ ] **Step 5: 请求任务级代码审查并提交**

调用 `code-review` 技能审查 Task 2，修复后重新运行 `pnpm test && pnpm lint`。

```bash
git add src/lib/email-limits.ts src/lib/recipients.ts src/lib/recipients.test.ts
git commit -m "feat: parse and validate recipients"
```

---

### Task 3: 实现上传、编辑、预览与中文发送交互

**Files:**
- Create: `src/components/email-sender.tsx`
- Modify: `src/app/page.tsx`
- Create: `playwright.config.ts`
- Test: `e2e/email-sender.spec.ts`

**Interfaces:**
- Consumes: `parseRecipients(raw)`、`MAX_HTML_BYTES`、`getUtf8ByteLength(value)` 和 Task 1 的 shadcn/ui 组件。
- Produces: 向 `POST /api/send` 提交 `{ recipients: string[]; subject: string; html: string }` 的完整客户端界面。

- [ ] **Step 1: 写失败的浏览器交互测试**

`playwright.config.ts`：

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

`e2e/email-sender.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

test("上传、编辑、预览、校验并发送 HTML 邮件", async ({ page }) => {
  let requestCount = 0;
  let payload: unknown;

  await page.route("**/api/send", async (route) => {
    requestCount += 1;
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, count: 2 }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "邮件发送平台" })).toBeVisible();

  await page.getByLabel("选择 HTML 文件").setInputFiles({
    name: "mail.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>上传内容</h1>"),
  });
  await expect(page.getByText("mail.html")).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="邮件预览"]').getByRole("heading", { name: "上传内容" }),
  ).toBeVisible();

  await page.getByLabel("HTML 源码").fill("<h1>编辑后的内容</h1>");
  await expect(
    page.frameLocator('iframe[title="邮件预览"]').getByRole("heading", { name: "编辑后的内容" }),
  ).toBeVisible();

  await page.getByLabel("收件人邮箱").fill("错误地址");
  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(page.getByRole("alert")).toContainText("以下邮箱格式不正确：错误地址");
  expect(requestCount).toBe(0);

  await page.getByLabel("收件人邮箱").fill("a@example.com，b@example.com");
  await page.getByRole("button", { name: "发送邮件" }).click();

  await expect(page.getByRole("alert")).toContainText("已成功发送 2 封邮件");
  expect(payload).toEqual({
    recipients: ["a@example.com", "b@example.com"],
    subject: "测试邮件",
    html: "<h1>编辑后的内容</h1>",
  });
});
```

- [ ] **Step 2: 安装 Chromium 并确认测试失败**

Run:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: FAIL，页面中找不到「选择 HTML 文件」。

- [ ] **Step 3: 实现客户端邮件发送器**

`src/components/email-sender.tsx`：

```tsx
"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_HTML_BYTES, getUtf8ByteLength } from "@/lib/email-limits";
import { parseRecipients } from "@/lib/recipients";

type Notice = { type: "success" | "error"; text: string } | null;

export function EmailSender() {
  const [fileName, setFileName] = useState("");
  const [html, setHtml] = useState("");
  const [recipientsInput, setRecipientsInput] = useState("");
  const [subject, setSubject] = useState("测试邮件");
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);

  async function loadFile(file?: File) {
    setNotice(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html")) {
      setNotice({ type: "error", text: "请选择 .html 文件。" });
      return;
    }
    if (file.size > MAX_HTML_BYTES) {
      setNotice({ type: "error", text: "HTML 文件不能超过 1 MB。" });
      return;
    }

    try {
      setHtml(await file.text());
      setFileName(file.name);
    } catch {
      setNotice({ type: "error", text: "文件读取失败，请重新选择。" });
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void loadFile(event.dataTransfer.files[0]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);

    const parsed = parseRecipients(recipientsInput);
    if (parsed.invalid.length) {
      setNotice({ type: "error", text: `以下邮箱格式不正确：${parsed.invalid.join("、")}` });
      return;
    }
    if (parsed.exceedsLimit) {
      setNotice({ type: "error", text: "每次最多发送给 50 个收件人。" });
      return;
    }
    if (!parsed.recipients.length) {
      setNotice({ type: "error", text: "请至少填写一个有效的收件邮箱。" });
      return;
    }
    if (!subject.trim()) {
      setNotice({ type: "error", text: "请输入邮件标题。" });
      return;
    }
    if (!html.trim()) {
      setNotice({ type: "error", text: "请上传或输入 HTML 邮件内容。" });
      return;
    }
    if (getUtf8ByteLength(html) > MAX_HTML_BYTES) {
      setNotice({ type: "error", text: "HTML 内容不能超过 1 MB。" });
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsed.recipients, subject: subject.trim(), html }),
      });
      const result = (await response.json()) as { ok: boolean; count?: number; error?: string };
      if (!response.ok || !result.ok) {
        setNotice({ type: "error", text: result.error || "邮件发送失败，请稍后重试。" });
        return;
      }
      setNotice({ type: "success", text: `已成功发送 ${result.count ?? 0} 封邮件。` });
    } catch {
      setNotice({ type: "error", text: "邮件发送失败，请检查网络后重试。" });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">内部工具</p>
        <h1 className="text-3xl font-semibold tracking-tight">邮件发送平台</h1>
        <p className="text-muted-foreground">上传并检查 HTML 内容，然后发送给指定收件人。</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>HTML 编辑</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-lg border border-dashed p-6 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Label htmlFor="html-file" className="cursor-pointer font-medium">拖入 HTML 文件，或点击选择</Label>
              <Input
                id="html-file"
                aria-label="选择 HTML 文件"
                type="file"
                accept=".html,text/html"
                className="sr-only"
                onChange={(event) => void loadFile(event.target.files?.[0])}
              />
              <p className="mt-2 text-sm text-muted-foreground">仅支持 .html，最大 1 MB</p>
              {fileName && <p className="mt-2 text-sm font-medium">{fileName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="html-source">HTML 源码</Label>
              <Textarea
                id="html-source"
                value={html}
                onChange={(event) => setHtml(event.target.value)}
                placeholder="上传文件后可在这里继续编辑"
                className="min-h-96 font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>邮件预览</CardTitle></CardHeader>
          <CardContent>
            <iframe
              title="邮件预览"
              sandbox=""
              srcDoc={html || "<p style='color:#71717a'>上传或输入 HTML 后将在这里预览。</p>"}
              className="h-[32rem] w-full rounded-lg border bg-white"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>发送设置</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="recipients">收件人邮箱</Label>
              <Textarea
                id="recipients"
                value={recipientsInput}
                onChange={(event) => setRecipientsInput(event.target.value)}
                placeholder="user@example.com，other@example.com"
              />
              <p className="text-sm text-muted-foreground">使用逗号、中文逗号或换行分隔，最多 50 个。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">邮件标题</Label>
              <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">
              默认 resend.dev 发件域名只能投递到 Resend 账户邮箱；发给其他人前请先验证自有域名。
            </p>
            {notice && (
              <Alert variant={notice.type === "error" ? "destructive" : "default"}>
                <AlertDescription>{notice.text}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={sending}>{sending ? "正在发送…" : "发送邮件"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

`src/app/page.tsx`：

```tsx
import { EmailSender } from "@/components/email-sender";

export default function HomePage() {
  return <EmailSender />;
}
```

- [ ] **Step 4: 运行浏览器测试确认通过**

Run: `pnpm test:e2e`

Expected: 1 test PASS，0 tests FAIL。

- [ ] **Step 5: 请求任务级代码审查并提交**

调用 `code-review` 技能审查 Task 3，重点检查无脚本预览、文件边界、可访问性和请求状态；修复后运行 `pnpm lint && pnpm test:e2e`。

```bash
git add src/app/page.tsx src/components/email-sender.tsx playwright.config.ts e2e/email-sender.spec.ts
git commit -m "feat: add HTML email editor and preview"
```

---

### Task 4: 用测试驱动服务端校验与 Resend 批量发送

**Files:**
- Create: `src/lib/send-request.ts`
- Test: `src/lib/send-request.test.ts`
- Create: `src/app/api/send/route.ts`

**Interfaces:**
- Consumes: 客户端请求 `{ recipients, subject, html }`、`parseRecipients()`、共享边界和环境变量 `RESEND_API_KEY`、`EMAIL_FROM`。
- Produces: `validateSendRequest(value)` 联合类型结果；`POST /api/send` 成功响应 `{ ok: true, count }` 或失败响应 `{ ok: false, error }`。

- [ ] **Step 1: 写失败的服务端请求校验测试**

`src/lib/send-request.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { validateSendRequest } from "./send-request.ts";

test("接受有效请求并清洗重复收件人", () => {
  assert.deepEqual(
    validateSendRequest({
      recipients: ["A@example.com", "a@example.com", "b@example.com"],
      subject: " 测试邮件 ",
      html: "<h1>你好</h1>",
    }),
    {
      ok: true,
      value: {
        recipients: ["A@example.com", "b@example.com"],
        subject: "测试邮件",
        html: "<h1>你好</h1>",
      },
    },
  );
});

test("拒绝无效字段、超量收件人和超大 HTML", () => {
  assert.deepEqual(validateSendRequest(null), { ok: false, error: "请求格式不正确。" });
  assert.deepEqual(validateSendRequest({ recipients: [], subject: "a", html: "b" }), {
    ok: false,
    error: "请至少填写一个有效的收件邮箱。",
  });
  assert.deepEqual(
    validateSendRequest({ recipients: ["错误地址"], subject: "a", html: "b" }),
    { ok: false, error: "以下邮箱格式不正确：错误地址" },
  );
  assert.deepEqual(
    validateSendRequest({
      recipients: Array.from({ length: 51 }, (_, index) => `u${index}@example.com`),
      subject: "a",
      html: "b",
    }),
    { ok: false, error: "每次最多发送给 50 个收件人。" },
  );
  assert.deepEqual(
    validateSendRequest({ recipients: ["a@example.com"], subject: "a", html: "你".repeat(400_000) }),
    { ok: false, error: "HTML 内容不能超过 1 MB。" },
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test`

Expected: FAIL，提示找不到 `send-request.ts`。

- [ ] **Step 3: 实现信任边界校验**

`src/lib/send-request.ts`：

```ts
import { MAX_HTML_BYTES, getUtf8ByteLength } from "./email-limits.ts";
import { parseRecipients } from "./recipients.ts";

export type SendRequest = {
  recipients: string[];
  subject: string;
  html: string;
};

export type SendRequestValidation =
  | { ok: true; value: SendRequest }
  | { ok: false; error: string };

export function validateSendRequest(input: unknown): SendRequestValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "请求格式不正确。" };

  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.recipients) || !value.recipients.every((item) => typeof item === "string")) {
    return { ok: false, error: "请求格式不正确。" };
  }

  const parsed = parseRecipients(value.recipients.join("\n"));
  if (parsed.invalid.length) {
    return { ok: false, error: `以下邮箱格式不正确：${parsed.invalid.join("、")}` };
  }
  if (parsed.exceedsLimit) return { ok: false, error: "每次最多发送给 50 个收件人。" };
  if (!parsed.recipients.length) return { ok: false, error: "请至少填写一个有效的收件邮箱。" };
  if (typeof value.subject !== "string" || !value.subject.trim()) {
    return { ok: false, error: "请输入邮件标题。" };
  }
  if (typeof value.html !== "string" || !value.html.trim()) {
    return { ok: false, error: "请上传或输入 HTML 邮件内容。" };
  }
  if (getUtf8ByteLength(value.html) > MAX_HTML_BYTES) {
    return { ok: false, error: "HTML 内容不能超过 1 MB。" };
  }

  return {
    ok: true,
    value: { recipients: parsed.recipients, subject: value.subject.trim(), html: value.html },
  };
}
```

- [ ] **Step 4: 运行单元测试确认通过**

Run: `pnpm test`

Expected: 5 tests PASS，0 tests FAIL。

- [ ] **Step 5: 实现 Resend Route Handler**

`src/app/api/send/route.ts`：

```ts
import { Resend } from "resend";
import { validateSendRequest } from "@/lib/send-request";

function failure(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("请求格式不正确。", 400);
  }

  const validation = validateSendRequest(body);
  if (!validation.ok) return failure(validation.error, 400);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return failure("邮件服务尚未配置，请检查 Resend 环境变量。", 500);

  const { recipients, subject, html } = validation.value;
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.batch.send(
      recipients.map((recipient) => ({ from, to: [recipient], subject, html })),
    );

    if (error || !data) {
      const message = error?.message ?? "";
      if (/domain|verify|validation/i.test(message)) {
        return failure("发件域名未验证，或测试域名不能发送到该收件人。", 502);
      }
      return failure("邮件发送失败，请稍后重试。", 502);
    }

    return Response.json({ ok: true, count: data.data.length });
  } catch {
    return failure("邮件发送失败，请稍后重试。", 502);
  }
}
```

- [ ] **Step 6: 验证构建和未配置环境变量的安全错误**

Run:

```bash
pnpm build
pnpm dev
```

在另一个终端运行：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/send \
  -H 'Content-Type: application/json' \
  -d '{"recipients":["a@example.com"],"subject":"测试邮件","html":"<h1>测试</h1>"}'
```

Expected: 构建成功；未配置 `.env.local` 时接口返回 `{"ok":false,"error":"邮件服务尚未配置，请检查 Resend 环境变量。"}`，且不包含密钥或堆栈。

- [ ] **Step 7: 请求任务级代码审查并提交**

调用 `code-review` 技能审查 Task 4，重点检查服务端重复校验、邮箱隐私、批量发送上限与异常脱敏；修复后运行 `pnpm test && pnpm lint && pnpm build`。

```bash
git add src/lib/send-request.ts src/lib/send-request.test.ts src/app/api/send/route.ts
git commit -m "feat: send isolated emails with Resend"
```

---

### Task 5: 补齐配置文档并完成全链路验证

**Files:**
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Consumes: 完整应用、Resend 免费账户和可选的真实 `RESEND_API_KEY`。
- Produces: 可复制的本地配置流程、自动化验证结果和真实发送验收步骤。

- [ ] **Step 1: 添加无密钥环境变量示例**

`.env.example`：

```dotenv
RESEND_API_KEY=
EMAIL_FROM="邮件发送平台 <onboarding@resend.dev>"
```

- [ ] **Step 2: 编写中文 README**

`README.md`：

```markdown
# 邮件发送平台

一个本地运行的中文 HTML 邮件发送工具：上传或编辑 HTML、实时预览，并通过 Resend 向多个收件人分别投递。

## 环境要求

- Node.js 24 或更高版本
- pnpm 10
- Resend 免费账户

## 本地启动

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 <http://127.0.0.1:3000>。

## 配置 Resend

1. 在 Resend 控制台创建 API Key，填入 `.env.local` 的 `RESEND_API_KEY`。
2. 首次测试可保留 `EMAIL_FROM="邮件发送平台 <onboarding@resend.dev>"`。
3. `resend.dev` 只能投递到当前 Resend 账户邮箱。若要发送给其他地址，请在 Resend 控制台验证自有域名，并把 `EMAIL_FROM` 改成该域名下的地址。
4. 免费套餐当前提供每月 3,000 封、每天 100 封和 1 个域名；每位收件人分别计入额度。

## 使用

1. 上传不超过 1 MB 的 `.html` 文件。
2. 在左侧修改源码，并在右侧检查预览。
3. 使用逗号、中文逗号或换行填写最多 50 个收件人。
4. 确认标题后点击「发送邮件」。平台会为每位收件人生成独立邮件，地址不会互相暴露。

## 验证

```bash
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

自动化测试拦截发送接口，不会消耗 Resend 额度。真实投递请配置 `.env.local` 后，通过页面发送到 Resend 账户邮箱。
```

- [ ] **Step 3: 运行全部自动化验证**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: ESLint 0 errors；5 个 Node.js tests PASS；Next.js 构建成功；1 个 Playwright test PASS。

- [ ] **Step 4: 执行真实发送验收**

在本地 `.env.local` 写入有效 `RESEND_API_KEY`，保留默认 `EMAIL_FROM`，启动 `pnpm dev`，通过页面向该 Resend 账户邮箱发送标题为「测试邮件」且正文包含 `<h1>真实发送测试</h1>` 的邮件。

Expected: 页面显示「已成功发送 1 封邮件」，Resend 控制台显示 delivered 事件，收件箱收到内容正确的邮件。不得把 `.env.local` 加入 Git。

- [ ] **Step 5: 请求最终代码审查并提交文档**

调用 `code-review` 技能审查完整 diff；修复后重复 Step 3。随后调用 `superpowers:verification-before-completion` 核对所有完成声明。

```bash
git add .env.example README.md e2e/email-sender.spec.ts
git commit -m "docs: add local email sending guide"
```

- [ ] **Step 6: 执行开发分支收尾流程**

调用 `superpowers:finishing-a-development-branch`，向用户提供合并、提交 PR、保留分支或丢弃四种选择，不自行执行其中任一项。
