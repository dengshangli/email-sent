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
