import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { embedQueryForKB, retrieveKB } from "./kb.ts";
import {
  checkLicense,
  checkServiceStatus,
  createTicket,
  runNetworkDiagnostics,
  sendPasswordReset,
  SLA_BY_PRIORITY,
  TEAM_BY_CATEGORY,
  unlockAccount,
  updateTicket,
} from "./tools.ts";
import type {
  Category,
  HelpDeskState,
  RetrievedChunk,
  RunMode,
  Severity,
  WorkflowName,
  WorkflowResult,
} from "../src/types.ts";

const CONFIDENCE_FLOOR = 0.55;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// 1. Privacy Guard
const PII_RULES: Array<{ label: string; regex: RegExp; isPassword?: boolean }> = [
  { label: "student_id", regex: /\b0\d{8}\b|\b\d{9}\b/g },
  { label: "email", regex: /[\w.+-]+@[\w-]+\.[\w.]+/g },
  { label: "phone", regex: /\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { label: "password", regex: /(password|passcode|pwd)\s*(is|=|:)\s*\S+/gi, isPassword: true },
];

export function privacyGuard(rawQuery: string): {
  query: string;
  pii_found: string[];
  ms: number;
} {
  const t0 = performance.now();
  let text = rawQuery;
  const found: string[] = [];
  for (const rule of PII_RULES) {
    if (rule.regex.test(text)) {
      found.push(rule.label);
      rule.regex.lastIndex = 0;
      if (rule.isPassword) {
        text = text.replace(rule.regex, (_m, p1) => `${p1} [REDACTED]`);
      } else {
        text = text.replace(rule.regex, `[${rule.label.toUpperCase()}]`);
      }
    }
  }
  return {
    query: text,
    pii_found: found,
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// 2. Intake Agent
const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  security: [
    "phish",
    "suspicious link",
    "clicked a link",
    "weird login",
    "fake login",
    "login page",
    "hacked",
    "compromis",
    "scam",
    "malware",
    "ransom",
    "didn't write",
    "didn't send",
  ],
  authentication: [
    "password",
    "locked",
    "lock out",
    "locked out",
    "log in",
    "login",
    "sign in",
    "duo",
    "mfa",
    "disabled",
    "two-factor",
    "2fa",
    "account",
  ],
  network: [
    "wifi",
    "wi-fi",
    "eduroam",
    "internet",
    "vpn",
    "globalprotect",
    "disconnect",
    "network",
    "ethernet",
  ],
  software: [
    "install",
    "office",
    "microsoft 365",
    "word",
    "excel",
    "adobe",
    "photoshop",
    "license",
    "spss",
    "tableau",
    "matlab",
    "software",
  ],
  hardware: [
    "laptop",
    "screen",
    "keyboard",
    "battery",
    "spill",
    "won't turn on",
    "power on",
    "cracked",
    "freez",
    "slow computer",
  ],
  email: ["email", "gmail", "inbox", "outlook", "mailbox"],
  printing: ["print", "printer"],
  learning_platform: ["canvas", "course", "submission", "submit", "assignment upload"],
};

// H09 Account-Takeover Security Fix (from Capstone Project Report p. 8)
const SECURITY_TAKEOVER_CUES = [
  "sending emails from my account",
  "emails from my account",
  "asking for gift cards",
  "gift card",
  "someone is sending",
  "someone else",
  "unauthorized",
  "account takeover",
  "took over",
];

const P1_CUES = [
  /\bexam\b/,
  /\bfinal\b/,
  /\bmidterm\b/,
  /emergency/,
  /starts in \d+ min/,
  /in \d+ minutes/,
  /whole building/,
  /everyone/,
  /entire class/,
];

const P2_CUES = [
  "due tonight",
  "due today",
  "due tomorrow",
  "deadline",
  "can't access",
  "cannot access",
  "can't log",
  "cannot log",
  "locked",
  "disabled",
  "can't submit",
  "cannot submit",
  "forgot",
];

const P3_CUES = [
  "keeps",
  "drops",
  "slow",
  "sometimes",
  "intermittent",
  "failed",
  "error",
  "not showing",
  "stuck",
  "won't",
  "crash",
];

const HUMAN_CUES = [
  "talk to a person",
  "real person",
  "human",
  "speak to someone",
  "call me",
  "get a person",
];

interface IntakeOutput {
  category: Category;
  severity: Severity;
  confidence: number;
  intent: string;
  workflow: WorkflowName;
  wants_human: boolean;
}

export async function classifyOffline(
  query: string,
  options?: { securityFix?: boolean }
): Promise<IntakeOutput> {
  const ql = query.toLowerCase();
  const securityFix = options?.securityFix ?? true;

  const scores: Record<string, number> = {};
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    scores[cat] = kws.reduce((acc, k) => acc + (ql.includes(k) ? 1 : 0), 0);
  }
  if (securityFix && SECURITY_TAKEOVER_CUES.some((c) => ql.includes(c))) {
    scores.security += 2;
  }
  if (scores.security > 0) {
    scores.security += 3;
  }

  const { hits } = await retrieveKB(query, undefined, { mode: "offline" });
  if (hits.length > 0 && hits[0].category in scores && scores[hits[0].category] > 0) {
    scores[hits[0].category] += 0.5;
  }
  if (ql.includes("canvas") && (ql.includes("password") || ql.includes("log")) && !ql.includes("submit")) {
    scores.authentication += 1;
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestCat, topScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? 0;

  if (topScore === 0) {
    return {
      category: "other",
      severity: "P4",
      confidence: 0.3,
      intent: "Request outside IT scope or unclear.",
      workflow: "none",
      wants_human: HUMAN_CUES.some((c) => ql.includes(c)),
    };
  }

  const conf = Math.round(Math.max(0.35, Math.min(0.95, 0.55 + 0.15 * topScore - 0.1 * secondScore)) * 100) / 100;
  let sev: Severity = "P4";
  if (bestCat === "security") {
    sev = "P1";
  } else if (P1_CUES.some((re) => re.test(ql)) && bestCat !== "printing") {
    sev = "P1";
  } else if (P2_CUES.some((c) => ql.includes(c))) {
    sev = "P2";
  } else if (P3_CUES.some((c) => ql.includes(c))) {
    sev = "P3";
  }

  if (
    /^(how do i|how can i|where|what|is there|can i)\b/.test(ql) &&
    sev === "P3" &&
    !ql.includes("error") &&
    !ql.includes("failed")
  ) {
    sev = "P4";
  }

  let wf: WorkflowName = "none";
  if (bestCat === "authentication") {
    if (ql.includes("disabled")) wf = "none";
    else if (ql.includes("locked") || ql.includes("lock out")) wf = "unlock_account";
    else if (ql.includes("forgot") || ql.includes("reset")) wf = "send_password_reset";
  } else if (bestCat === "network" && !ql.includes("vpn") && !ql.includes("how do i")) {
    wf = "run_network_diagnostics";
  } else if (bestCat === "software" && (ql.includes("license") || ql.includes("adobe"))) {
    wf = "check_license";
  }
  if (/\bis (canvas|email|wifi|wi-fi|the vpn|vpn)\b.*\bdown\b/.test(ql)) {
    wf = "check_service_status";
  }

  return {
    category: bestCat as Category,
    severity: sev,
    confidence: conf,
    intent: query.slice(0, 120),
    workflow: wf,
    wants_human: HUMAN_CUES.some((c) => ql.includes(c)),
  };
}

const INTAKE_SYSTEM = `You are the Intake Agent for SpartanAssist, a university IT help desk. Classify the student's redacted request.
Severity rubric:
- P1: exam/midterm/final/class in progress, security incident (phishing, hacked, unauthorized emails/account takeover), or outage hitting many users
- P2: blocked from a required system with a deadline
- P3: degraded performance or error, workaround exists
- P4: how-to question or general inquiry
Workflow:
- send_password_reset: forgot password / reset password
- unlock_account: locked out after failed attempts (NOTE: 'disabled' accounts are NOT unlockable -> use 'none')
- run_network_diagnostics: Wi-Fi drops, no internet on campus (NOT VPN or how-to)
- check_service_status: asks if Canvas/Wi-Fi/email/VPN is down
- check_license: software license or Adobe/Office entitlement
- none: everything else
Requests unrelated to campus IT -> category 'other'.`;

async function intakeAgent(
  query: string,
  mode: RunMode,
  ai: GoogleGenAI | null,
  securityFix: boolean
): Promise<{ result: IntakeOutput; fallback?: string; ms: number }> {
  const t0 = performance.now();
  if (mode === "gemini" && ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: query,
        config: {
          systemInstruction: INTAKE_SYSTEM,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                enum: [
                  "network",
                  "authentication",
                  "software",
                  "hardware",
                  "email",
                  "printing",
                  "learning_platform",
                  "security",
                  "other",
                ],
              },
              severity: { type: Type.STRING, enum: ["P1", "P2", "P3", "P4"] },
              confidence: { type: Type.NUMBER },
              intent: { type: Type.STRING },
              workflow: {
                type: Type.STRING,
                enum: [
                  "send_password_reset",
                  "unlock_account",
                  "run_network_diagnostics",
                  "check_service_status",
                  "check_license",
                  "none",
                ],
              },
              wants_human: { type: Type.BOOLEAN },
            },
            required: ["category", "severity", "confidence", "intent", "workflow", "wants_human"],
          },
        },
      });
      const parsed = JSON.parse((response.text ?? "{}").trim()) as IntakeOutput;
      // Enforce security takeover safety net even in LLM mode
      const ql = query.toLowerCase();
      if (securityFix && SECURITY_TAKEOVER_CUES.some((c) => ql.includes(c))) {
        parsed.category = "security";
        parsed.severity = "P1";
      }
      return {
        result: {
          category: parsed.category ?? "other",
          severity: parsed.severity ?? "P3",
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.8))),
          intent: parsed.intent ?? query.slice(0, 120),
          workflow: parsed.workflow ?? "none",
          wants_human: Boolean(parsed.wants_human) || HUMAN_CUES.some((c) => ql.includes(c)),
        },
        ms: Math.round((performance.now() - t0) * 100) / 100,
      };
    } catch (err) {
      const offline = await classifyOffline(query, { securityFix });
      return {
        result: offline,
        fallback: err instanceof Error ? err.message : "Gemini Intake unavailable, used offline classifier",
        ms: Math.round((performance.now() - t0) * 100) / 100,
      };
    }
  }
  const offline = await classifyOffline(query, { securityFix });
  return {
    result: offline,
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// 3. Knowledge Agent
function parseStepsFromText(text: string): string[] {
  const afterTitle = text.split(". ").slice(2).join(". ").trim() || text;
  const numbered = afterTitle.split(/\s+(?=\d+\.\s)/).map((s) => s.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  if (numbered.length > 1) {
    return numbered.slice(0, 6);
  }
  const sentences = afterTitle
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, 6);
}

function composeOfflineKnowledge(hits: RetrievedChunk[]): { answer: string; steps: string[] } {
  const best = hits[0];
  const steps = parseStepsFromText(best.text);
  const lines = [
    `Here's what to do — **${best.section}**:`,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    `Source: ${best.title} [${best.doc_id}]`,
  ];
  return { answer: lines.join("\n"), steps };
}

async function knowledgeAgent(
  query: string,
  category: Category,
  mode: RunMode,
  ai: GoogleGenAI | null,
  precomputedGemini?: { queryVec: number[]; docVecs: number[][] } | null
): Promise<{
  retrieved: RetrievedChunk[];
  grounded: boolean;
  answer: string;
  steps: string[];
  citations: string[];
  ms: number;
}> {
  const t0 = performance.now();
  const { hits } = await retrieveKB(query, category, { mode, ai, precomputedGemini });
  let grounded = hits.length > 0;
  let answer = "";
  let steps: string[] = [];
  let citations: string[] = [];

  if (hits.length > 0) {
    if (mode === "gemini" && ai) {
      try {
        const ctx = hits.map((h) => `[${h.doc_id}] ${h.section}: ${h.text}`).join("\n\n");
        const prompt = `You are a helpful campus IT specialist at SpartanAssist. Answer ONLY from the context below using plain language (around an 8th-grade reading level).
Lead with the fix: write short, numbered action steps (maximum 6 steps, one clear action per step).
Cite the source inline like [KB-NET-01]. If the context does not answer the student's question, reply with exactly: NOT_IN_KB.

Context:
${ctx}

Student issue: ${query}`;
        const resp = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
        const text = (resp.text ?? "").trim();
        const foundCites = Array.from(new Set(text.match(/\[(KB-[A-Z]+-\d+)\]/g)?.map((m) => m.slice(1, -1)) ?? []));
        const retrievedIds = new Set(hits.map((h) => h.doc_id));
        const allValid = foundCites.length > 0 && foundCites.every((c) => retrievedIds.has(c));

        if (text.includes("NOT_IN_KB") || !allValid) {
          grounded = false;
          answer = "";
          steps = [];
          citations = [];
        } else {
          answer = text;
          citations = foundCites;
          const numberedMatches = text
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => /^\d+[\.)]\s+/.test(l))
            .map((l) => l.replace(/^\d+[\.)]\s+/, "").trim());
          steps = numberedMatches.length > 0 ? numberedMatches.slice(0, 6) : parseStepsFromText(hits[0].text);
        }
      } catch {
        const offline = composeOfflineKnowledge(hits);
        answer = offline.answer;
        steps = offline.steps;
        citations = [hits[0].doc_id];
      }
    } else {
      const offline = composeOfflineKnowledge(hits);
      answer = offline.answer;
      steps = offline.steps;
      citations = [hits[0].doc_id];
    }
  }

  return {
    retrieved: hits,
    grounded,
    answer,
    steps,
    citations,
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// 4. Workflow Agent
function workflowAgent(
  state: Partial<HelpDeskState>,
  skipTicketWrite = false
): {
  workflow_result: WorkflowResult;
  ticket_id?: string;
  ms: number;
} {
  const t0 = performance.now();
  const wf = state.workflow ?? "none";
  const user = state.user_id ?? "student_001";
  const query = state.query ?? "";
  let result: WorkflowResult = { success: true, action: "ticket_only" };

  if (wf === "check_license") {
    const product = query.toLowerCase().includes("adobe") ? "Adobe Creative Cloud" : "Microsoft 365";
    result = checkLicense(user, product);
  } else if (wf === "check_service_status") {
    result = checkServiceStatus("all");
  } else if (wf === "send_password_reset") {
    result = sendPasswordReset(user);
  } else if (wf === "unlock_account") {
    result = unlockAccount(user);
  } else if (wf === "run_network_diagnostics") {
    const bldgMatch = query.match(/in\s+(?:the\s+)?([a-z]+(?:\s+building)?)/i);
    result = runNetworkDiagnostics(user, bldgMatch?.[1] ?? "campus");
  }

  let ticketId: string | undefined;
  if (!skipTicketWrite) {
    const t = createTicket({
      user,
      category: state.category ?? "other",
      priority: state.severity ?? "P3",
      summary: query.slice(0, 140),
      status: "open",
      team: TEAM_BY_CATEGORY[state.category ?? "other"] ?? "service_desk",
      trace: [...(state.trace ?? []), "workflow"],
    });
    ticketId = t.ticket_id;
  } else {
    ticketId = `INC-EVAL-${Math.floor(10000 + Math.random() * 89999)}`;
  }

  return {
    workflow_result: result,
    ticket_id: ticketId,
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// 5. Escalation Agent
export function getEscalationReasons(s: Partial<HelpDeskState>): string[] {
  const r: string[] = [];
  if (s.severity === "P1") r.push("P1 severity");
  if (s.category === "security") r.push("possible security incident");
  if ((s.confidence ?? 1) < CONFIDENCE_FLOOR && s.category !== "other") {
    r.push("low classification confidence");
  }
  if (s.category !== "other" && s.grounded === false) {
    r.push("no grounded KB answer");
  }
  if (s.workflow_result && s.workflow_result.success === false) {
    r.push(`automation failed: ${s.workflow_result.message ?? ""}`);
  }
  if (
    s.category === "hardware" &&
    /(spill|crack|won't turn on|power on|broken)/i.test(s.query ?? "")
  ) {
    r.push("physical repair required");
  }
  if (s.wants_human) {
    r.push("user requested a person");
  }
  return r;
}

async function escalationAgent(
  state: Partial<HelpDeskState>,
  _mode: RunMode,
  _ai: GoogleGenAI | null,
  skipTicketWrite = false
): Promise<{
  escalated: boolean;
  ticket_id?: string;
  escalation: NonNullable<HelpDeskState["escalation"]>;
  ms: number;
}> {
  const t0 = performance.now();
  const reasons = getEscalationReasons(state);
  const effectiveReasons = reasons.length > 0 ? reasons : ["routing rule"];
  const sev = state.severity ?? "P3";
  const cat = state.category ?? "other";
  const team = TEAM_BY_CATEGORY[cat] ?? "service_desk";
  const channel =
    sev === "P1"
      ? "phone (24/7 line)"
      : effectiveReasons.includes("physical repair required")
      ? "walk-in help desk"
      : "ticket portal";

  const kbIds = (state.retrieved ?? []).map((h) => h.doc_id).join(", ") || "none";
  const handoff = `${sev} ${cat} case for ${state.user_id}. Issue: ${(state.query ?? "").slice(0, 160)}. AI steps: ${(state.trace ?? []).join(" -> ")}; workflow=${state.workflow ?? "none"}. KB evidence: ${kbIds}. Escalated because: ${effectiveReasons.join("; ")}.`;

  let tid = state.ticket_id;
  if (!skipTicketWrite) {
    if (tid) {
      updateTicket(tid, "escalated", handoff);
    } else {
      tid = createTicket({
        user: state.user_id ?? "student_001",
        category: cat,
        priority: sev,
        summary: (state.query ?? "").slice(0, 140),
        status: "escalated",
        team,
        notes: handoff,
        trace: [...(state.trace ?? []), "escalation", "responder"],
        escalation_reasons: effectiveReasons,
      }).ticket_id;
    }
  } else if (!tid) {
    tid = `INC-EVAL-${Math.floor(10000 + Math.random() * 89999)}`;
  }

  return {
    escalated: true,
    ticket_id: tid,
    escalation: {
      reasons: effectiveReasons,
      team,
      channel,
      sla: SLA_BY_PRIORITY[sev] ?? "1 business day",
      handoff,
    },
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// 6. Responder
function responderNode(
  state: Partial<HelpDeskState>,
  skipTicketWrite = false
): {
  status: HelpDeskState["status"];
  final_response: string;
  ms: number;
} {
  const t0 = performance.now();
  const parts: string[] = [];
  let status: HelpDeskState["status"];

  if (state.category === "other") {
    status = "out_of_scope";
    parts.push(
      "I can only help with campus IT topics (Wi-Fi, accounts, software, devices, email, printing, Canvas). For anything else, the campus info line can point you in the right direction."
    );
  } else {
    status = state.escalated ? "escalated" : "resolved";
    if (state.answer) parts.push(state.answer);
    if (state.workflow_result?.message) {
      parts.push(`Done for you: ${state.workflow_result.message}`);
    }
    if (state.escalated && state.escalation) {
      parts.push(
        `A person is taking over. Your case went to the ${state.escalation.team.replace(/_/g, " ")} team via ${state.escalation.channel} (target response: ${state.escalation.sla}).`
      );
    } else if (state.ticket_id && !skipTicketWrite) {
      updateTicket(state.ticket_id, "resolved", "auto-resolved by SpartanAssist");
    }
  }

  if (state.ticket_id) {
    parts.push(`Ticket ${state.ticket_id}`);
  }
  if (state.pii_found && state.pii_found.length > 0) {
    parts.push(
      `I hid personal details you typed (${state.pii_found.join(", ")}) — never share your password with anyone, including me.`
    );
  }

  return {
    status,
    final_response: parts.join("\n\n"),
    ms: Math.round((performance.now() - t0) * 100) / 100,
  };
}

// Orchestrator matching LangGraph conditional edges
export async function runHelpDeskPipeline(
  rawQuery: string,
  options?: {
    userId?: string;
    mode?: RunMode | "auto";
    forceHuman?: boolean;
    skipTicketWrite?: boolean;
    securityFix?: boolean;
  }
): Promise<HelpDeskState> {
  const tStart = performance.now();
  const userId = options?.userId ?? "student_001";
  const skipTicketWrite = options?.skipTicketWrite ?? false;
  const securityFix = options?.securityFix ?? true;

  const ai = getGeminiClient();
  const requestedMode = options?.mode ?? "auto";
  const modeUsed: RunMode =
    requestedMode === "auto"
      ? ai
        ? "gemini"
        : "offline"
      : requestedMode === "gemini" && ai
      ? "gemini"
      : "offline";

  const trace: string[] = [];
  const timings: Record<string, number> = {};

  // Node 1: Privacy Guard
  const pg = privacyGuard(rawQuery);
  trace.push("privacy_guard");
  timings.privacy_guard = pg.ms;

  // Node 2: Intake Agent (run Gemini query embedding in parallel to eliminate serial wait)
  const [intake, precomputedGemini] = await Promise.all([
    intakeAgent(pg.query, modeUsed, ai, securityFix),
    modeUsed === "gemini" && ai ? embedQueryForKB(pg.query, ai) : Promise.resolve(null),
  ]);
  trace.push("intake");
  timings.intake = intake.ms;
  if (options?.forceHuman) {
    intake.result.wants_human = true;
  }

  const state: HelpDeskState = {
    user_id: userId,
    raw_query: rawQuery,
    query: pg.query,
    pii_found: pg.pii_found,
    category: intake.result.category,
    severity: intake.result.severity,
    confidence: intake.result.confidence,
    intent: intake.result.intent,
    workflow: intake.result.workflow,
    wants_human: intake.result.wants_human,
    retrieved: [],
    grounded: false,
    answer: "",
    steps: [],
    citations: [],
    escalated: false,
    status: "resolved",
    final_response: "",
    trace,
    timings,
    latency_ms: 0,
    mode_used: intake.fallback ? "offline" : modeUsed,
    fallback_reason: intake.fallback,
  };

  // Edge after_intake
  const skipRag = state.category === "other" && state.confidence < 0.4 && !state.wants_human;
  if (!skipRag) {
    // Node 3: Knowledge Agent
    const kn = await knowledgeAgent(
      state.query,
      state.category,
      modeUsed,
      ai,
      precomputedGemini
    );
    state.retrieved = kn.retrieved;
    state.grounded = kn.grounded;
    state.answer = kn.answer;
    state.steps = kn.steps;
    state.citations = kn.citations;
    state.trace.push("knowledge");
    state.timings.knowledge = kn.ms;

    // Edge after_knowledge
    if (state.category !== "other") {
      if (state.severity === "P1" || state.category === "security") {
        // Fast lane straight to Escalation
        const esc = await escalationAgent(state, modeUsed, ai, skipTicketWrite);
        state.escalated = esc.escalated;
        state.ticket_id = esc.ticket_id;
        state.escalation = esc.escalation;
        state.trace.push("escalation");
        state.timings.escalation = esc.ms;
      } else {
        const preReasons = getEscalationReasons(state);
        if (preReasons.length > 0 && state.workflow === "none") {
          const esc = await escalationAgent(state, modeUsed, ai, skipTicketWrite);
          state.escalated = esc.escalated;
          state.ticket_id = esc.ticket_id;
          state.escalation = esc.escalation;
          state.trace.push("escalation");
          state.timings.escalation = esc.ms;
        } else if (state.workflow !== "none" || preReasons.length > 0) {
          // Node 4: Workflow Agent
          const wfRes = workflowAgent(state, skipTicketWrite);
          state.workflow_result = wfRes.workflow_result;
          state.ticket_id = wfRes.ticket_id;
          state.trace.push("workflow");
          state.timings.workflow = wfRes.ms;

          // Edge after_workflow
          if (getEscalationReasons(state).length > 0) {
            const esc = await escalationAgent(state, modeUsed, ai, skipTicketWrite);
            state.escalated = esc.escalated;
            state.ticket_id = esc.ticket_id;
            state.escalation = esc.escalation;
            state.trace.push("escalation");
            state.timings.escalation = esc.ms;
          }
        }
      }
    }
  }

  // Node 6: Responder
  const resp = responderNode(state, skipTicketWrite);
  state.status = resp.status;
  state.final_response = resp.final_response;
  state.trace.push("responder");
  state.timings.responder = resp.ms;
  state.latency_ms = Math.round((performance.now() - tStart) * 100) / 100;

  return state;
}
