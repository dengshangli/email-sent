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
          errorResponseCode(error) === 454 ||
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
