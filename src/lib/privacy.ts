export type SensitiveCategory =
  | "private_key"
  | "jwt_token"
  | "api_key"
  | "access_token"
  | "credit_card"
  | "bank_account"
  | "ssn"
  | "password"
  | "email"
  | "phone"
  | "student_id";

export interface PrivacyMaskResult {
  masked: string;
  detectedTypes: SensitiveCategory[];
  hasSensitive: boolean;
}

const SENSITIVE_LABELS: Record<SensitiveCategory, string> = {
  private_key: "private key",
  jwt_token: "JWT token",
  api_key: "API key",
  access_token: "access token",
  credit_card: "credit card",
  bank_account: "bank account",
  ssn: "SSN",
  password: "password",
  email: "email",
  phone: "phone number",
  student_id: "student ID",
};

export function formatSensitiveLabels(types: string[]): string {
  return types.map((t) => SENSITIVE_LABELS[t as SensitiveCategory] ?? t).join(", ");
}

function isAlreadyMaskedToken(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return true;
  if (/^\*+$/.test(trimmed)) return true;
  if (/^\*{2,}[-\s]?\*{2,}/.test(trimmed)) return true;
  if (/^\[REDACTED(?:_[A-Z_]+)?\]$/i.test(trimmed)) return true;
  if (/^\[STUDENT_ID\]$/i.test(trimmed)) return true;
  return false;
}

function isValidLuhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19 || !/^\d+$/.test(digits)) {
    return false;
  }
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function maskLast4(raw: string, prefixMask = "*******"): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `${prefixMask}${digits.slice(-4)}`;
  }
  return "*******";
}

export function maskSensitiveText(
  input: string,
  extraSecrets?: string[]
): PrivacyMaskResult {
  if (!input) {
    return { masked: "", detectedTypes: [], hasSensitive: false };
  }

  let text = input;
  const detected = new Set<SensitiveCategory>();

  const mark = (cat: SensitiveCategory) => {
    detected.add(cat);
  };

  // 0. Explicitly mask any configured server secrets if echoed
  if (extraSecrets && extraSecrets.length > 0) {
    for (const secret of extraSecrets) {
      if (secret && secret.length >= 8 && text.includes(secret)) {
        text = text.split(secret).join("*******");
        mark("api_key");
      }
    }
  }

  // 1. PEM private keys
  text = text.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    () => {
      mark("private_key");
      return "*******";
    }
  );

  // 2. JWT tokens (three base64url segments starting with eyJ)
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    () => {
      mark("jwt_token");
      return "*******";
    }
  );

  // 3. Known API key & token formats
  const knownKeyPatterns: Array<{ regex: RegExp; cat: SensitiveCategory }> = [
    // Google / Gemini API keys
    { regex: /(?<![A-Za-z0-9])AIza[0-9A-Za-z\-_]{20,}\b/g, cat: "api_key" },
    // AWS Access Key IDs
    { regex: /(?<![A-Za-z0-9])(?:AKIA|ASIA|AROA|AIDA|ABIA|ACCA)[0-9A-Z]{16}\b/g, cat: "api_key" },
    // GitHub personal/OAuth/fine-grained tokens
    { regex: /(?<![A-Za-z0-9])(?:ghp|gho|ghu|ghs|ghr|github_pat)_[0-9A-Za-z_]{16,}\b/g, cat: "access_token" },
    // Stripe / webhook / modern prefixed secret keys
    { regex: /(?<![A-Za-z0-9])(?:sk|pk|rk|whsec)_(?:live|test|proj|ant)?_?[0-9A-Za-z\-_]{12,}\b/g, cat: "api_key" },
    // OpenAI / Anthropic style sk- keys
    { regex: /(?<![A-Za-z0-9])sk-(?:proj-|ant-|svcacct-)?[0-9A-Za-z\-_]{16,}\b/g, cat: "api_key" },
    // Slack tokens
    { regex: /(?<![A-Za-z0-9])xox[baprs]-[0-9A-Za-z\-]{10,}\b/g, cat: "access_token" },
    // SendGrid keys
    { regex: /(?<![A-Za-z0-9])SG\.[0-9A-Za-z\-_]{16,}\.[0-9A-Za-z\-_]{16,}\b/g, cat: "api_key" },
  ];
  for (const { regex, cat } of knownKeyPatterns) {
    text = text.replace(regex, () => {
      mark(cat);
      return "*******";
    });
  }

  // Bearer / Basic / Token auth headers
  text = text.replace(
    /\b(Bearer|Basic|Token)\s+([A-Za-z0-9\-._~+/]{8,}=*)/gi,
    (full, scheme: string, token: string) => {
      if (isAlreadyMaskedToken(token)) return full;
      mark("access_token");
      return `${scheme} *******`;
    }
  );

  // 4. Labeled API keys, secrets, and access tokens
  text = text.replace(
    /\b(api[\s_-]?key|client[\s_-]?secret|secret[\s_-]?key|private[\s_-]?key|aws[\s_-]?secret(?:[\s_-]?access[\s_-]?key)?|signing[\s_-]?secret|webhook[\s_-]?secret|encryption[\s_-]?key)\s*(is|was|=|:)\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s,;]+))/gi,
    (full, label: string, sep: string, dq?: string, sq?: string, bare?: string) => {
      const val = dq ?? sq ?? bare ?? "";
      if (isAlreadyMaskedToken(val)) return full;
      mark("api_key");
      const joiner = sep === "=" ? "=" : sep === ":" ? ": " : ` ${sep} `;
      return `${label}${joiner}*******`;
    }
  );

  text = text.replace(
    /\b(access[\s_-]?token|refresh[\s_-]?token|auth[\s_-]?token|bearer[\s_-]?token|id[\s_-]?token|session[\s_-]?token|oauth[\s_-]?token|csrf[\s_-]?token|token)\s*(is|was|=|:)\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s,;]+))/gi,
    (full, label: string, sep: string, dq?: string, sq?: string, bare?: string) => {
      const val = dq ?? sq ?? bare ?? "";
      if (isAlreadyMaskedToken(val)) return full;
      mark("access_token");
      const joiner = sep === "=" ? "=" : sep === ":" ? ": " : ` ${sep} `;
      return `${label}${joiner}*******`;
    }
  );

  // 5. Credit card numbers & CVV/CVC
  text = text.replace(
    /\b((?:credit|debit)[\s_-]?card(?:\s*(?:number|num|no|#))?|card(?:\s*(?:number|num|no|#))?|visa|mastercard|amex|discover)\s*(?:(is|was|=|:|#)\s*)?((?:\d[ -]?){11,18}\d)\b/gi,
    (full, label: string, sep: string | undefined, cardNum: string) => {
      if (isAlreadyMaskedToken(cardNum)) return full;
      const digits = cardNum.replace(/\D/g, "");
      if (digits.length < 12 || digits.length > 19) return full;
      mark("credit_card");
      const joiner = !sep ? " " : sep === "=" ? "=" : sep === ":" || sep === "#" ? `${sep} ` : ` ${sep} `;
      return `${label}${joiner}****-****-****-${digits.slice(-4)}`;
    }
  );

  // Grouped major-network card formats (e.g. 4532-1234-5678-9010 or 3782 822463 10005) even if a digit was mistyped
  text = text.replace(
    /(?<![\d*])(?:(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|6(?:011|5\d{2}))([ -])\d{4}\1\d{4}\1\d{1,4}|3[47]\d{2}([ -])\d{6}\2\d{5})\b(?![\d*])/g,
    (full) => {
      const digits = full.replace(/\D/g, "");
      mark("credit_card");
      return `****-****-****-${digits.slice(-4)}`;
    }
  );

  text = text.replace(
    /(?<![\d*])(?:\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}|\d{13,19})\b(?![\d*])/g,
    (full) => {
      const digits = full.replace(/\D/g, "");
      if (!isValidLuhn(digits)) return full;
      mark("credit_card");
      return `****-****-****-${digits.slice(-4)}`;
    }
  );

  text = text.replace(
    /\b(cvv2?|cvc2?|security[\s_-]?code)\s*(is|was|=|:)?\s*(\d{3,4})\b/gi,
    (full, label: string, sep: string | undefined, code: string) => {
      if (isAlreadyMaskedToken(code)) return full;
      mark("credit_card");
      const joiner = !sep ? " " : sep === "=" ? "=" : sep === ":" ? ": " : ` ${sep} `;
      return `${label}${joiner}***`;
    }
  );

  // 6. Social Security Numbers (formatted & labeled)
  text = text.replace(
    /\b(?!000|666|9\d{2})(\d{3})[-\s](?!00)(\d{2})[-\s](?!0000)(\d{4})\b/g,
    (_full, _a: string, _b: string, last4: string) => {
      mark("ssn");
      return `***-**-${last4}`;
    }
  );

  text = text.replace(
    /\b(ssn|social[\s_-]?security(?:\s*(?:number|num|no|#))?)\s*(?:(is|was|=|:|#)\s*)?(\d{9})\b/gi,
    (_full, label: string, sep: string | undefined, digits: string) => {
      mark("ssn");
      const joiner = !sep ? " " : sep === "=" ? "=" : sep === ":" || sep === "#" ? `${sep} ` : ` ${sep} `;
      return `${label}${joiner}***-**-${digits.slice(-4)}`;
    }
  );

  // 7. Bank Account / Routing / IBAN
  text = text.replace(
    /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    (full) => {
      mark("bank_account");
      return `*******${full.slice(-4)}`;
    }
  );

  text = text.replace(
    /\b(bank[\s_-]*(?:account|acct)(?:\s*(?:number|num|no|#))?|checking(?:\s*(?:account|acct))?(?:\s*(?:number|num|no|#))?|savings(?:\s*(?:account|acct))?(?:\s*(?:number|num|no|#))?|routing(?:\s*(?:number|num|no|#))?|aba(?:\s*(?:number|num|no|#))?|account[\s_-]*(?:number|num|no|#)|acct[\s_-]*(?:number|num|no|#))\s*(?:(is|was|=|:|#)\s*)?([A-Z0-9-]{6,20})\b/gi,
    (full, label: string, sep: string | undefined, acct: string) => {
      if (isAlreadyMaskedToken(acct)) return full;
      const digitCount = acct.replace(/\D/g, "").length;
      if (digitCount < 5) return full;
      mark("bank_account");
      const joiner = !sep ? " " : sep === "=" ? "=" : sep === ":" || sep === "#" ? `${sep} ` : ` ${sep} `;
      return `${label}${joiner}${maskLast4(acct, "*******")}`;
    }
  );

  // 8. Passwords, Passcodes, Passphrases, PINs, Secrets
  text = text.replace(
    /\b(password|passcode|passphrase|pwd|pin(?:\s*code)?|secret)\s*(is|was|=|:)\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s,;]+))/gi,
    (full, label: string, sep: string, dq?: string, sq?: string, bare?: string) => {
      const val = dq ?? sq ?? bare ?? "";
      if (isAlreadyMaskedToken(val)) return full;
      mark("password");
      const joiner = sep === "=" ? "=" : sep === ":" ? ": " : ` ${sep} `;
      return `${label}${joiner}*******`;
    }
  );

  // Credential without explicit separator when token clearly looks like a password/PIN (has digit or symbol)
  text = text.replace(
    /\b(password|passcode|pwd)\s+(?=[A-Za-z0-9!@#$%^&*_+\-=.]{4,}(?:\d|[!@#$%^&*_+=]))([^\s,;]+)/gi,
    (full, label: string, val: string) => {
      if (isAlreadyMaskedToken(val)) return full;
      mark("password");
      return `${label} *******`;
    }
  );

  // 9. Email addresses (skip already partially masked j***@domain)
  text = text.replace(
    /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    (full, local: string, domain: string) => {
      if (local.includes("***")) return full;
      mark("email");
      const firstChar = local.length > 1 ? local[0] : "";
      return `${firstChar}***@${domain}`;
    }
  );

  // 10. Phone numbers (US/North America 10-digit formats)
  text = text.replace(
    /(?:\+?1[-.\s]?)?\(?\b([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g,
    (_full, _area: string, _mid: string, last4: string) => {
      mark("phone");
      return `***-***-${last4}`;
    }
  );

  // 11. 9-digit Student / Campus IDs
  text = text.replace(
    /\b(?:0\d{8}|\d{9})\b/g,
    (full) => {
      mark("student_id");
      return `*****${full.slice(-4)}`;
    }
  );

  return {
    masked: text,
    detectedTypes: Array.from(detected),
    hasSensitive: detected.size > 0,
  };
}
