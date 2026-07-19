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
