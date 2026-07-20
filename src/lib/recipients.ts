import { MAX_RECIPIENTS } from "./email-limits.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 常见域名拼写错误 → 正确域名
const TYPO_DOMAINS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "qq.con": "qq.com",
  "qq.cm": "qq.com",
  "163.con": "163.com",
  "126.con": "126.com",
  "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yahho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
};

export type SuspiciousRecipient = { email: string; suggestedDomain: string };

export type RecipientParseResult = {
  recipients: string[];
  invalid: string[];
  suspicious: SuspiciousRecipient[];
  exceedsLimit: boolean;
};

export function parseRecipients(raw: string): RecipientParseResult {
  const seen = new Set<string>();
  const unique = raw
    .split(/[,，\n]+/)
    .map((email) => email.trim())
    .filter((email) => {
      const key = email.toLowerCase();
      if (!email || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const recipients = unique.filter((email) => EMAIL_PATTERN.test(email));

  return {
    recipients,
    invalid: unique.filter((email) => !EMAIL_PATTERN.test(email)),
    suspicious: recipients.flatMap((email) => {
      const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
      const suggestedDomain = TYPO_DOMAINS[domain];
      return suggestedDomain ? [{ email, suggestedDomain }] : [];
    }),
    exceedsLimit: unique.length > MAX_RECIPIENTS,
  };
}
