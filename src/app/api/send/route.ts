import { Resend } from "resend";
import { validateSendRequest } from "../../../lib/send-request.ts";

let resendClient: Resend | undefined;
let resendApiKey: string | undefined;

function getResend(apiKey: string) {
  if (!resendClient || resendApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendApiKey = apiKey;
  }
  return resendClient;
}

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
    const { data, error } = await getResend(apiKey).batch.send(
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
