import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/send/route.ts";

async function withResendConfig(
  apiKey: string,
  mockFetch: typeof fetch,
  run: () => Promise<void>,
) {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = apiKey;
  process.env.EMAIL_FROM = "邮件发送平台 <sender@example.com>";
  globalThis.fetch = mockFetch;

  try {
    await run();
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
    globalThis.fetch = previousFetch;
  }
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

test("缺少 Resend 配置时返回脱敏中文错误", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;

  try {
    const response = await POST(
      new Request("http://localhost/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: ["a@example.com"],
          subject: "测试邮件",
          html: "<h1>测试</h1>",
        }),
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "邮件服务尚未配置，请检查 Resend 环境变量。",
    });
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  }
});

test("通过一次批量请求向每位收件人发送独立邮件", async () => {
  let batchPayload: unknown;
  let fetchCalls = 0;
  const mockFetch = (async (_input, init) => {
    fetchCalls += 1;
    batchPayload = JSON.parse(String(init?.body));
    return Response.json({ data: [{ id: "email-1" }, { id: "email-2" }] });
  }) as typeof fetch;

  await withResendConfig("re_success", mockFetch, async () => {
    const response = await POST(
      new Request("http://localhost/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: ["a@example.com", "b@example.com"],
          subject: "测试邮件",
          html: "<h1>测试</h1>",
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, count: 2 });
    assert.equal(fetchCalls, 1);
    assert.deepEqual(batchPayload, [
      {
        from: "邮件发送平台 <sender@example.com>",
        to: ["a@example.com"],
        subject: "测试邮件",
        html: "<h1>测试</h1>",
      },
      {
        from: "邮件发送平台 <sender@example.com>",
        to: ["b@example.com"],
        subject: "测试邮件",
        html: "<h1>测试</h1>",
      },
    ]);
  });
});

test("底层网络异常不会泄露原始错误", async () => {
  const mockFetch = (async () => {
    throw new Error("包含敏感信息的底层错误");
  }) as typeof fetch;

  await withResendConfig("re_failure", mockFetch, async () => {
    const response = await POST(
      new Request("http://localhost/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: ["a@example.com"],
          subject: "测试邮件",
          html: "<h1>测试</h1>",
        }),
      }),
    );

    const body = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(body, { ok: false, error: "邮件发送失败，请稍后重试。" });
    assert.equal(JSON.stringify(body).includes("敏感信息"), false);
  });
});

test("Resend 域名错误转换为专用中文提示", async () => {
  const mockFetch = (async () =>
    Response.json(
      { name: "validation_error", message: "The domain is not verified." },
      { status: 403 },
    )) as typeof fetch;

  await withResendConfig("re_domain_error", mockFetch, async () => {
    const response = await POST(
      new Request("http://localhost/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: ["a@example.com"],
          subject: "测试邮件",
          html: "<h1>测试</h1>",
        }),
      }),
    );

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "发件域名未验证，或测试域名不能发送到该收件人。",
    });
  });
});
