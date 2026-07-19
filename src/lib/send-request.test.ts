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

test("拒绝非对象或字段类型错误的请求", () => {
  assert.deepEqual(validateSendRequest(null), { ok: false, error: "请求格式不正确。" });
  assert.deepEqual(validateSendRequest({ recipients: "a@example.com", subject: "a", html: "b" }), {
    ok: false,
    error: "请求格式不正确。",
  });
});

test("拒绝空收件人", () => {
  assert.deepEqual(validateSendRequest({ recipients: [], subject: "a", html: "b" }), {
    ok: false,
    error: "请至少填写一个有效的收件邮箱。",
  });
});

test("拒绝无效邮箱", () => {
  assert.deepEqual(validateSendRequest({ recipients: ["错误地址"], subject: "a", html: "b" }), {
    ok: false,
    error: "以下邮箱格式不正确：错误地址",
  });
});

test("拒绝超过 50 个收件人", () => {
  assert.deepEqual(
    validateSendRequest({
      recipients: Array.from({ length: 51 }, (_, index) => `u${index}@example.com`),
      subject: "a",
      html: "b",
    }),
    { ok: false, error: "每次最多发送给 50 个收件人。" },
  );
});

test("拒绝空标题", () => {
  assert.deepEqual(validateSendRequest({ recipients: ["a@example.com"], subject: " ", html: "b" }), {
    ok: false,
    error: "请输入邮件标题。",
  });
});

test("拒绝空 HTML", () => {
  assert.deepEqual(validateSendRequest({ recipients: ["a@example.com"], subject: "a", html: " " }), {
    ok: false,
    error: "请上传或输入 HTML 邮件内容。",
  });
});

test("拒绝超过 1 MB 的 UTF-8 HTML", () => {
  assert.deepEqual(
    validateSendRequest({ recipients: ["a@example.com"], subject: "a", html: "你".repeat(400_000) }),
    { ok: false, error: "HTML 内容不能超过 1 MB。" },
  );
});
