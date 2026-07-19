import { MAX_RECIPIENTS } from "./email-limits.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RecipientParseResult = {
  recipients: string[];
  invalid: string[];
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

  return {
    recipients: unique.filter((email) => EMAIL_PATTERN.test(email)),
    invalid: unique.filter((email) => !EMAIL_PATTERN.test(email)),
    exceedsLimit: unique.length > MAX_RECIPIENTS,
  };
}
