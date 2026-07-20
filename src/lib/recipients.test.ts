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
    suspicious: [],
    exceedsLimit: false,
  });
});

test("识别常见域名拼写错误并给出建议", () => {
  const result = parseRecipients("dengshangli.001@gamil.com, ok@gmail.com，foo@qq.con");

  assert.deepEqual(result.suspicious, [
    { email: "dengshangli.001@gamil.com", suggestedDomain: "gmail.com" },
    { email: "foo@qq.con", suggestedDomain: "qq.com" },
  ]);
  assert.deepEqual(result.recipients, [
    "dengshangli.001@gamil.com",
    "ok@gmail.com",
    "foo@qq.con",
  ]);
});

test("识别未穷举的近似拼写错误（编辑距离 1）", () => {
  assert.deepEqual(parseRecipients("dengshangli001@gmil.com").suspicious, [
    { email: "dengshangli001@gmil.com", suggestedDomain: "gmail.com" },
  ]);
  assert.deepEqual(parseRecipients("a@gmai.com, b@hotmall.com").suspicious, [
    { email: "a@gmai.com", suggestedDomain: "gmail.com" },
    { email: "b@hotmall.com", suggestedDomain: "hotmail.com" },
  ]);
});

test("正确域名与无关域名不被误报", () => {
  const result = parseRecipients(
    "a@gmail.com, b@qq.com, c@163.com, d@example.com, e@mycompany.cn",
  );
  assert.deepEqual(result.suspicious, []);
});

test("超过 50 个唯一地址时报告超限", () => {
  const raw = Array.from({ length: 51 }, (_, index) => `user${index}@example.com`).join(",");
  assert.equal(parseRecipients(raw).exceedsLimit, true);
});

test("按 UTF-8 字节数检查 HTML 大小", () => {
  assert.equal(getUtf8ByteLength("你"), 3);
  assert.equal(getUtf8ByteLength("a".repeat(MAX_HTML_BYTES)), MAX_HTML_BYTES);
});
