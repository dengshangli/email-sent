import assert from "node:assert/strict";
import test from "node:test";
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

test("拒绝无法解析的 JSON", async () => {
  const response = await POST(
    new Request("http://localhost/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "请求格式不正确。" });
});

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
    if (message.to === "bad@163.com") {
      throw Object.assign(new Error("secret"), { code: "EENVELOPE" });
    }
    return { accepted: [message.to], rejected: [] };
  });

  await withSmtpConfig(async () => {
    const response = await post(
      validRequest(["ok@gmail.com", "bad@163.com", "ok@qq.com"]),
    );
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

test("Gmail 认证失败时提示应用专用密码且不泄露底层错误", async () => {
  const post = createPost(async () => {
    throw Object.assign(new Error("secret smtp response"), { code: "EAUTH" });
  });

  await withSmtpConfig(async () => {
    const response = await post(validRequest(["a@gmail.com"]));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(body, {
      ok: false,
      acceptedCount: 0,
      failedRecipients: ["a@gmail.com"],
      error: "Gmail 认证失败，请检查两步验证和应用专用密码。",
    });
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
    assert.deepEqual(await response.json(), {
      ok: false,
      acceptedCount: 0,
      failedRecipients: ["a@gmail.com"],
      error: "Gmail 发送额度已用完或暂时受限，请稍后重试。",
    });
  });
});

test("普通临时 SMTP 异常不误报为 Gmail 额度问题", async () => {
  const post = createPost(async () => {
    throw Object.assign(new Error("Temporary server error"), { responseCode: 450 });
  });

  await withSmtpConfig(async () => {
    const response = await post(validRequest(["a@gmail.com"]));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false,
      acceptedCount: 0,
      failedRecipients: ["a@gmail.com"],
      error: "邮件发送失败，请稍后重试。",
    });
  });
});

test("未知 SMTP 异常不会泄露原始错误", async () => {
  const post = createPost(async () => {
    throw new Error("包含敏感信息的底层错误");
  });

  await withSmtpConfig(async () => {
    const response = await post(validRequest(["a@gmail.com", "b@163.com"]));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(body, {
      ok: false,
      acceptedCount: 0,
      failedRecipients: ["a@gmail.com", "b@163.com"],
      error: "邮件发送失败，请稍后重试。",
    });
    assert.equal(JSON.stringify(body).includes("敏感信息"), false);
  });
});
