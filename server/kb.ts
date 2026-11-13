import { GoogleGenAI } from "@google/genai";
import type { KBArticle, KBChunk, RetrievedChunk, RunMode } from "../src/types.ts";

export const KB_ARTICLES: KBArticle[] = [
  {
    id: "KB-NET-01",
    category: "network",
    title: "Campus Wi-Fi (eduroam) Troubleshooting",
    body: `
## Connect to eduroam
Choose the network named eduroam (not the guest network). Username is your full campus email; password is your campus account password. Accept the campus security certificate when prompted.
## Wi-Fi keeps disconnecting or drops every few minutes
1. Forget eduroam and reconnect. 2. Turn off private / randomized MAC address for eduroam. 3. Disable adapter power saving (Windows: Device Manager > Network adapters > Power Management). 4. Update the wireless driver. 5. Move closer to an access point; dead zones are listed on the outage board. If it still drops on two different devices, report the building and room so Networking can check the access point.
## Connected but no internet
Run the automated network diagnostic. Flush DNS (ipconfig /flushdns on Windows, sudo dscacheutil -flushcache on macOS) and set IP to automatic (DHCP). Check the campus status page for outages.
`,
  },
  {
    id: "KB-NET-02",
    category: "network",
    title: "VPN (GlobalProtect) Setup and Errors",
    body: `
## Install and connect to the VPN
Download GlobalProtect from the software portal. Portal address: vpn.campus.example. Sign in with your campus account and approve the Duo push. The VPN is needed for library databases, remote desktops and some department drives when off campus.
## VPN will not connect or keeps dropping
1. Confirm your internet works without VPN. 2. Quit and reopen GlobalProtect, then reconnect. 3. If you see 'gateway not responding', pick a different gateway from the menu. 4. Turn off other VPNs and ad blockers. 5. If Duo never arrives, see the MFA article.
`,
  },
  {
    id: "KB-ACC-01",
    category: "authentication",
    title: "Password Reset and Account Lockout",
    body: `
## Forgot password / reset password
Use the self-service reset portal: verify with your registered recovery email or phone, then choose a new password (minimum 12 characters, not one of your last 5). The reset link expires in 30 minutes. The help desk assistant can send the reset link for you.
## Account locked after failed attempts
Accounts lock for 15 minutes after 5 failed sign-ins. The assistant can unlock the account immediately after identity verification. Repeated lockouts usually mean an old password saved on a phone or laptop; update saved passwords in mail apps and Wi-Fi.
## Account disabled
A disabled account (not locked) is an administrative hold, for example enrollment, HR status or a security block. It cannot be fixed by self-service; it must be reviewed by the Accounts team.
`,
  },
  {
    id: "KB-ACC-02",
    category: "authentication",
    title: "Multi-Factor Authentication (Duo)",
    body: `
## Not receiving Duo push
Check that the phone has internet, open the Duo app and pull to refresh, and confirm the phone time is set automatically. Use a passcode from the Duo app instead of a push if needed.
## New phone or lost phone
Use a backup device or a one-time bypass code. Lost phones should be removed from your devices list right away. Enrolling a new phone requires identity verification by the help desk.
`,
  },
  {
    id: "KB-SW-01",
    category: "software",
    title: "Software Licensing and Installation",
    body: `
## Microsoft 365 / Office installation failed
1. Sign in at the Office portal with your campus email and choose Install apps. 2. Uninstall older Office versions first (use the Microsoft Support and Recovery Assistant). 3. Make sure you have 10 GB free and restart. 4. Each student can install on 5 devices; remove an old device if you hit the limit.
## Adobe Creative Cloud access
Students in eligible courses and labs get Adobe licenses. Sign in with your campus email using 'Company or School account'. If the app says no license, the assistant can check your license entitlement.
## Specialty software (SPSS, Tableau, MATLAB)
Request through the software portal. Some titles are lab-only; virtual lab access is available through the remote desktop service.
`,
  },
  {
    id: "KB-HW-01",
    category: "hardware",
    title: "Laptop Problems and Loaner Program",
    body: `
## Slow laptop or freezing
Restart, install pending updates, close browser tabs, check free disk space (keep 15% free), and run a malware scan.
## Physical damage (cracked screen, spill, will not power on)
Do not keep trying to power on a laptop after a liquid spill. Physical repair requires a technician; bring the device to the walk-in help desk. Short-term loaner laptops are available while a device is repaired.
`,
  },
  {
    id: "KB-EML-01",
    category: "email",
    title: "Campus Email (Google Workspace)",
    body: `
## Add campus email to a phone or Outlook
Use 'Sign in with Google', enter your campus email, and approve the Duo prompt. App passwords are not needed for modern mail apps.
## Not receiving emails / mailbox full
Check Spam and filters, and check storage usage. Storage is pooled across Gmail and Drive; empty Trash in both.
`,
  },
  {
    id: "KB-PRN-01",
    category: "printing",
    title: "Campus Printing",
    body: `
## Print from your laptop
Upload a PDF at the web print portal or install the print driver, then release the job at any lab printer by tapping your student ID. Black-and-white is 10 cents per page, color 50 cents.
## Print job stuck or not showing at the printer
Jobs are held for 24 hours. Check your print balance, confirm you picked the correct queue (B&W vs color), and re-upload the PDF if it shows 'error'.
`,
  },
  {
    id: "KB-LMS-01",
    category: "learning_platform",
    title: "Canvas Access and Submission Issues",
    body: `
## Cannot see a course in Canvas
Courses appear once the instructor publishes them, usually by the first day of class. Enrollment changes take up to 24 hours to sync.
## Upload or submission failed
Try another browser, clear cache, keep file names short without special characters, and check the file-size limit (500 MB). Take a screenshot showing the time of the failed attempt and email it to your instructor to document a deadline issue.
`,
  },
  {
    id: "KB-SEC-01",
    category: "security",
    title: "Phishing and Compromised Accounts",
    body: `
## Clicked a suspicious link or entered your password on a fake page
Change your password immediately from a trusted device, sign out of all sessions, and report the message with the Report Phishing button. A security analyst must review possible compromises; the help desk escalates these as Priority 1.
`,
  },
  {
    id: "KB-POL-01",
    category: "policy",
    title: "Ticket Priorities and Escalation Policy",
    body: `
## Priority levels and response targets
P1 critical (exam in progress, security incident, outage affecting many users): 15-minute response, phone or walk-in. P2 high (blocked from a required system with a deadline): 4 hours. P3 medium (degraded, workaround exists): 1 business day. P4 low (how-to question): 3 business days.
## Help desk hours and contacts
Walk-in help desk Monday to Friday 8am to 6pm; phone line 24/7 for P1 issues. Tickets can be tracked in the self-service portal.
`,
  },
];

export const KB_CHUNKS: KBChunk[] = [];
for (const doc of KB_ARTICLES) {
  const parts = ("\n" + doc.body.trim()).split(/\n## /);
  for (const rawPart of parts) {
    const part = rawPart.trim().replace(/^#+\s*/, "").trim();
    if (!part) continue;
    const newlineIdx = part.indexOf("\n");
    const section = newlineIdx === -1 ? part : part.slice(0, newlineIdx);
    const text = newlineIdx === -1 ? "" : part.slice(newlineIdx + 1);
    KB_CHUNKS.push({
      chunk_id: `${doc.id}#${KB_CHUNKS.length}`,
      doc_id: doc.id,
      category: doc.category,
      title: doc.title,
      section: section.trim(),
      text: text.replace(/\s+/g, " ").trim(),
    });
  }
}

const SYNONYMS: Record<string, string> = {
  hacked: "compromised phishing",
  wifi: "wi-fi eduroam",
  internet: "wi-fi network",
  down: "outage",
  login: "sign in",
  log: "sign",
  stats: "spss",
  app: "software",
  slow: "freezing",
  laptop: "device",
  dropping: "disconnecting drops",
};

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for",
  "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself",
  "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
  "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
  "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
  "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too",
  "under", "until", "up", "very", "was", "we", "were", "what", "when", "where", "which",
  "while", "who", "whom", "why", "will", "with", "would", "you", "your", "yours", "yourself",
  "yourselves",
  // Domain stop words
  "campus", "student", "students", "near", "best", "good", "help", "need", "use", "using",
]);

function stem(w: string): string {
  return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return matches.filter((w) => !STOP_WORDS.has(w)).map(stem);
}

function expandQuery(text: string): string {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const extra = words.filter((w) => w in SYNONYMS).map((w) => SYNONYMS[w]);
  return extra.length ? `${text} ${extra.join(" ")}` : text;
}

// Build local TF-IDF vectors matching scikit-learn sublinear_tf + l2 norm
const docStrings = KB_CHUNKS.map((c) => `${c.title}. ${c.section}. ${c.text}`);
const docTokens = docStrings.map(tokenize);
const vocabMap = new Map<string, number>();
const dfCounts: number[] = [];

for (const tokens of docTokens) {
  const seen = new Set<string>();
  for (const tok of tokens) {
    if (!vocabMap.has(tok)) {
      vocabMap.set(tok, vocabMap.size);
      dfCounts.push(0);
    }
    if (!seen.has(tok)) {
      seen.add(tok);
      const idx = vocabMap.get(tok)!;
      dfCounts[idx] += 1;
    }
  }
}

const N_DOCS = KB_CHUNKS.length;
const idfWeights = dfCounts.map((df) => Math.log((1 + N_DOCS) / (1 + df)) + 1);

function vectorizeTfIdf(tokens: string[]): number[] {
  const tf = new Map<number, number>();
  for (const tok of tokens) {
    const idx = vocabMap.get(tok);
    if (idx !== undefined) {
      tf.set(idx, (tf.get(idx) ?? 0) + 1);
    }
  }
  const vec = new Array<number>(vocabMap.size).fill(0);
  let normSq = 0;
  for (const [idx, count] of tf.entries()) {
    const val = (1 + Math.log(count)) * idfWeights[idx];
    vec[idx] = val;
    normSq += val * val;
  }
  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      if (vec[i] !== 0) vec[i] /= norm;
    }
  }
  return vec;
}

const tfidfDocVectors = docTokens.map(vectorizeTfIdf);

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

let geminiChunkVectors: number[][] | null = null;
let geminiEmbedPromise: Promise<number[][] | null> | null = null;

export async function ensureGeminiEmbeddings(ai: GoogleGenAI): Promise<number[][] | null> {
  if (geminiChunkVectors) return geminiChunkVectors;
  if (geminiEmbedPromise) return geminiEmbedPromise;

  geminiEmbedPromise = (async () => {
    try {
      const res = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: docStrings,
      });
      const embeddings = res.embeddings?.map((e) => e.values ?? []) ?? [];
      if (embeddings.length === KB_CHUNKS.length && embeddings[0].length > 0) {
        geminiChunkVectors = embeddings;
        return geminiChunkVectors;
      }
      return null;
    } catch {
      return null;
    } finally {
      geminiEmbedPromise = null;
    }
  })();

  return geminiEmbedPromise;
}

export async function embedQueryForKB(
  query: string,
  ai: GoogleGenAI
): Promise<{ queryVec: number[]; docVecs: number[][] } | null> {
  try {
    const [cachedDocs, qRes] = await Promise.all([
      ensureGeminiEmbeddings(ai),
      ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: query,
      }),
    ]);
    const qVals = qRes.embeddings?.[0]?.values;
    if (cachedDocs && qVals && qVals.length > 0) {
      return { queryVec: qVals, docVecs: cachedDocs };
    }
    return null;
  } catch {
    return null;
  }
}

export const SIMILARITY_THRESHOLDS: Record<RunMode, number> = {
  gemini: 0.52,
  offline: 0.1,
};

export async function retrieveKB(
  query: string,
  category?: string,
  options?: {
    mode?: RunMode;
    ai?: GoogleGenAI | null;
    k?: number;
    nCandidates?: number;
    precomputedGemini?: { queryVec: number[]; docVecs: number[][] } | null;
  }
): Promise<{ hits: RetrievedChunk[]; usedEmbeddings: "gemini-embedding-2" | "tfidf-local" }> {
  const mode = options?.mode ?? "offline";
  const k = options?.k ?? 2;
  const nCandidates = options?.nCandidates ?? 6;
  const ai = options?.ai ?? null;

  let queryVec: number[] | null = null;
  let docVecs: number[][] = tfidfDocVectors;
  let usedEmbeddings: "gemini-embedding-2" | "tfidf-local" = "tfidf-local";
  let minSim = SIMILARITY_THRESHOLDS.offline;

  if (mode === "gemini" && options?.precomputedGemini) {
    queryVec = options.precomputedGemini.queryVec;
    docVecs = options.precomputedGemini.docVecs;
    usedEmbeddings = "gemini-embedding-2";
    minSim = SIMILARITY_THRESHOLDS.gemini;
  } else if (mode === "gemini" && ai) {
    const embedded = await embedQueryForKB(query, ai);
    if (embedded) {
      queryVec = embedded.queryVec;
      docVecs = embedded.docVecs;
      usedEmbeddings = "gemini-embedding-2";
      minSim = SIMILARITY_THRESHOLDS.gemini;
    }
  }

  if (!queryVec) {
    queryVec = vectorizeTfIdf(tokenize(expandQuery(query)));
    docVecs = tfidfDocVectors;
    usedEmbeddings = "tfidf-local";
    minSim = SIMILARITY_THRESHOLDS.offline;
  }

  const stem5 = (t: string): Set<string> => {
    const words = t.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    return new Set(words.map((w) => w.slice(0, 5)));
  };
  const qStems = stem5(query);

  const candidates = KB_CHUNKS.map((chunk, idx) => {
    const sim = cosineSim(queryVec!, docVecs[idx]);
    const secStems = stem5(chunk.section);
    let overlap = 0;
    for (const s of qStems) {
      if (secStems.has(s)) overlap += 1;
    }
    const catBoost = category && chunk.category === category ? 0.05 : 0;
    const score = sim + catBoost + 0.04 * overlap;
    return {
      ...chunk,
      text: docStrings[idx],
      similarity: Math.round(sim * 1000) / 1000,
      score: Math.round(score * 1000) / 1000,
    };
  })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, nCandidates)
    .sort((a, b) => b.score - a.score);

  const filtered = candidates.filter((h) => h.similarity >= minSim).slice(0, k);
  return { hits: filtered, usedEmbeddings };
}
