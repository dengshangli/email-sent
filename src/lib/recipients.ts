import { MAX_RECIPIENTS } from "./email-limits.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 主流邮箱域名：与这些域名只差一个字符的写法视为疑似拼写错误
const POPULAR_DOMAINS = [
  "gmail.com",
  "qq.com",
  "163.com",
  "126.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "foxmail.com",
  "sina.com",
  "live.com",
];

// 本身就是合法邮箱域名、但与主流域名只差一个字符，避免误报
const LEGIT_LOOKALIKE_DOMAINS = ["mail.com"];

// 是否恰好相差一次编辑（增、删、改一个字符，或相邻两字符调换）
function isOneEditAway(a: string, b: string): boolean {
  const lengthDiff = a.length - b.length;
  if (Math.abs(lengthDiff) > 1) return false;

  if (lengthDiff === 0) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i += 1;
    if (i === a.length) return false;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }

  const [shorter, longer] = lengthDiff < 0 ? [a, b] : [b, a];
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i += 1;
  return shorter.slice(i) === longer.slice(i + 1);
}

function findSuggestedDomain(domain: string): string | undefined {
  if (POPULAR_DOMAINS.includes(domain) || LEGIT_LOOKALIKE_DOMAINS.includes(domain)) {
    return undefined;
  }
  return POPULAR_DOMAINS.find((popular) => isOneEditAway(domain, popular));
}

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
      const suggestedDomain = findSuggestedDomain(domain);
      return suggestedDomain ? [{ email, suggestedDomain }] : [];
    }),
    exceedsLimit: unique.length > MAX_RECIPIENTS,
  };
}
