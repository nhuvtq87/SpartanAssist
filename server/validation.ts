import { runHelpDeskPipeline } from "./agents.ts";
import type {
  Category,
  ResolutionStatus,
  RunMode,
  Severity,
  ValidationMetrics,
  ValidationRow,
} from "../src/types.ts";

interface MainTestCase {
  id: string;
  query: string;
  exp_category: Category;
  exp_severity: Severity;
  exp_doc: string | null;
  exp_status: ResolutionStatus;
}

interface HeldoutTestCase {
  id: string;
  query: string;
  exp_category: Category;
  exp_status: ResolutionStatus;
}

export const MAIN_TESTS: MainTestCase[] = [
  { id: "T01", query: "The campus wifi keeps dropping every few minutes in the engineering building", exp_category: "network", exp_severity: "P3", exp_doc: "KB-NET-01", exp_status: "resolved" },
  { id: "T02", query: "Connected to eduroam but no internet at all in my dorm", exp_category: "network", exp_severity: "P3", exp_doc: "KB-NET-01", exp_status: "resolved" },
  { id: "T03", query: "How do I set up the VPN to use library databases from home?", exp_category: "network", exp_severity: "P4", exp_doc: "KB-NET-02", exp_status: "resolved" },
  { id: "T04", query: "I forgot my password and can't log into Canvas, homework due tomorrow", exp_category: "authentication", exp_severity: "P2", exp_doc: "KB-ACC-01", exp_status: "resolved" },
  { id: "T05", query: "My account is locked after I typed the wrong password a bunch of times", exp_category: "authentication", exp_severity: "P2", exp_doc: "KB-ACC-01", exp_status: "resolved" },
  { id: "T06", query: "I got a new phone and Duo pushes don't come anymore", exp_category: "authentication", exp_severity: "P3", exp_doc: "KB-ACC-02", exp_status: "resolved" },
  { id: "T07", query: "Account disabled message and my midterm starts in 10 minutes", exp_category: "authentication", exp_severity: "P1", exp_doc: "KB-ACC-01", exp_status: "escalated" },
  { id: "T08", query: "Microsoft Office installation failed with an error on my Windows laptop", exp_category: "software", exp_severity: "P3", exp_doc: "KB-SW-01", exp_status: "resolved" },
  { id: "T09", query: "Adobe Photoshop says I don't have a license but I'm in the design class", exp_category: "software", exp_severity: "P3", exp_doc: "KB-SW-01", exp_status: "resolved" },
  { id: "T10", query: "Where can I get SPSS for my stats class?", exp_category: "software", exp_severity: "P4", exp_doc: "KB-SW-01", exp_status: "resolved" },
  { id: "T11", query: "I spilled coffee on my laptop and it won't turn on", exp_category: "hardware", exp_severity: "P3", exp_doc: "KB-HW-01", exp_status: "escalated" },
  { id: "T12", query: "My laptop is super slow and freezing during Zoom", exp_category: "hardware", exp_severity: "P3", exp_doc: "KB-HW-01", exp_status: "resolved" },
  { id: "T13", query: "How do I add my campus email to my iPhone?", exp_category: "email", exp_severity: "P4", exp_doc: "KB-EML-01", exp_status: "resolved" },
  { id: "T14", query: "My print job is stuck and not showing at the printer", exp_category: "printing", exp_severity: "P3", exp_doc: "KB-PRN-01", exp_status: "resolved" },
  { id: "T15", query: "I can't see my BUS4 course in Canvas yet", exp_category: "learning_platform", exp_severity: "P4", exp_doc: "KB-LMS-01", exp_status: "resolved" },
  { id: "T16", query: "Canvas submission failed and my assignment is due tonight", exp_category: "learning_platform", exp_severity: "P2", exp_doc: "KB-LMS-01", exp_status: "resolved" },
  { id: "T17", query: "I think my account got hacked, there are emails sent I didn't write", exp_category: "security", exp_severity: "P1", exp_doc: "KB-SEC-01", exp_status: "escalated" },
  { id: "T18", query: "Wifi is down for everyone in the whole building during class", exp_category: "network", exp_severity: "P1", exp_doc: "KB-NET-01", exp_status: "escalated" },
  { id: "T19", query: "My VPN keeps dropping, can I talk to a real person?", exp_category: "network", exp_severity: "P3", exp_doc: "KB-NET-02", exp_status: "escalated" },
  { id: "T20", query: "Can you recommend a good parking spot near the student union?", exp_category: "other", exp_severity: "P4", exp_doc: null, exp_status: "out_of_scope" },
];

export const HELDOUT_TESTS: HeldoutTestCase[] = [
  { id: "H01", query: "eduroam won't let me connect, it keeps asking for my password again", exp_category: "network", exp_status: "resolved" },
  { id: "H02", query: "GlobalProtect says gateway not responding", exp_category: "network", exp_status: "resolved" },
  { id: "H03", query: "need to reset my password, I can't remember it", exp_category: "authentication", exp_status: "resolved" },
  { id: "H04", query: "Duo isn't sending me anything when I sign in", exp_category: "authentication", exp_status: "resolved" },
  { id: "H05", query: "Excel keeps crashing when I open big files", exp_category: "software", exp_status: "resolved" },
  { id: "H06", query: "my laptop screen is cracked after I dropped it", exp_category: "hardware", exp_status: "escalated" },
  { id: "H07", query: "Gmail says my storage is full", exp_category: "email", exp_status: "resolved" },
  { id: "H08", query: "the color printer in the library ate my job", exp_category: "printing", exp_status: "resolved" },
  { id: "H09", query: "someone is sending emails from my account asking for gift cards", exp_category: "security", exp_status: "escalated" },
  { id: "H10", query: "can you help me write my cover letter?", exp_category: "other", exp_status: "out_of_scope" },
];

const SEV_NUM: Record<Severity, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

function computeCsatProxy(
  status: ResolutionStatus,
  expStatus: ResolutionStatus,
  hasAnswer: boolean,
  escalated: boolean,
  citations: string[],
  ticketId: string | undefined,
  latencyMs: number
): number {
  let s = 1;
  s += status === expStatus ? 1 : 0;
  s += hasAnswer || escalated || status === "out_of_scope" ? 1 : 0;
  s += citations.length > 0 || status === "out_of_scope" ? 0.5 : 0;
  s += ticketId || status === "out_of_scope" ? 0.5 : 0;
  s += latencyMs < 8000 ? 1 : 0;
  return Math.min(5, s);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        results[idx] = await fn(items[idx]);
      }
    })
  );
  return results;
}

export async function runValidationSuite(options?: {
  mode?: RunMode;
  securityFix?: boolean;
}): Promise<{ rows: ValidationRow[]; metrics: ValidationMetrics }> {
  const mode = options?.mode ?? "offline";
  const securityFix = options?.securityFix ?? true;
  const concurrency = mode === "gemini" ? 6 : 30;

  const [mainRows, heldoutRows] = await Promise.all([
    mapWithConcurrency(MAIN_TESTS, concurrency, async (t): Promise<ValidationRow> => {
      const out = await runHelpDeskPipeline(t.query, {
        userId: `tester_${t.id}`,
        mode,
        skipTicketWrite: true,
        securityFix,
      });
      const gotDocs = out.retrieved.map((h) => h.doc_id);
      const hitAt2 = t.exp_doc ? gotDocs.includes(t.exp_doc) : gotDocs.length === 0;
      const citesValid =
        out.citations.every((c) => gotDocs.includes(c)) &&
        (out.citations.length > 0 || out.status !== "resolved");
      const secFn = t.exp_category === "security" && out.category !== "security";

      return {
        id: t.id,
        suite: "main",
        query: t.query,
        exp_category: t.exp_category,
        category: out.category,
        exp_severity: t.exp_severity,
        severity: out.severity,
        exp_status: t.exp_status,
        status: out.status,
        exp_doc: t.exp_doc,
        retrieved: gotDocs,
        workflow: out.workflow,
        confidence: out.confidence,
        latency_ms: Math.round(out.latency_ms * 10) / 10,
        path: out.trace.join(" → "),
        cat_ok: out.category === t.exp_category,
        sev_ok: out.severity === t.exp_severity,
        sev_within1: Math.abs(SEV_NUM[out.severity] - SEV_NUM[t.exp_severity]) <= 1,
        route_ok: out.status === t.exp_status,
        hit_at_2: hitAt2,
        grounded_ok: citesValid,
        security_false_negative: secFn,
        csat_proxy: computeCsatProxy(
          out.status,
          t.exp_status,
          Boolean(out.answer),
          out.escalated,
          out.citations,
          out.ticket_id,
          out.latency_ms
        ),
      };
    }),
    mapWithConcurrency(HELDOUT_TESTS, concurrency, async (h): Promise<ValidationRow> => {
      const out = await runHelpDeskPipeline(h.query, {
        userId: `heldout_${h.id}`,
        mode,
        skipTicketWrite: true,
        securityFix,
      });
      const gotDocs = out.retrieved.map((r) => r.doc_id);
      const secFn = h.exp_category === "security" && out.category !== "security";

      return {
        id: h.id,
        suite: "heldout",
        query: h.query,
        exp_category: h.exp_category,
        category: out.category,
        severity: out.severity,
        exp_status: h.exp_status,
        status: out.status,
        retrieved: gotDocs,
        workflow: out.workflow,
        confidence: out.confidence,
        latency_ms: Math.round(out.latency_ms * 10) / 10,
        path: out.trace.join(" → "),
        cat_ok: out.category === h.exp_category,
        route_ok: out.status === h.exp_status,
        security_false_negative: secFn,
        csat_proxy: computeCsatProxy(
          out.status,
          h.exp_status,
          Boolean(out.answer),
          out.escalated,
          out.citations,
          out.ticket_id,
          out.latency_ms
        ),
      };
    }),
  ]);

  const rows: ValidationRow[] = [...mainRows, ...heldoutRows];
  const latencies = mainRows.map((r) => r.latency_ms).sort((a, b) => a - b);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const metrics: ValidationMetrics = {
    mode,
    scenarios_main: mainRows.length,
    scenarios_heldout: heldoutRows.length,
    category_accuracy: avg(mainRows.map((r) => (r.cat_ok ? 1 : 0))),
    severity_exact_accuracy: avg(mainRows.map((r) => (r.sev_ok ? 1 : 0))),
    severity_within1_accuracy: avg(mainRows.map((r) => (r.sev_within1 ? 1 : 0))),
    routing_accuracy: avg(mainRows.map((r) => (r.route_ok ? 1 : 0))),
    retrieval_hit_at_2: avg(mainRows.map((r) => (r.hit_at_2 ? 1 : 0))),
    grounded_answers: avg(mainRows.map((r) => (r.grounded_ok ? 1 : 0))),
    auto_resolved_rate: avg(mainRows.map((r) => (r.status === "resolved" ? 1 : 0))),
    escalated_rate: avg(mainRows.map((r) => (r.status === "escalated" ? 1 : 0))),
    out_of_scope_rate: avg(mainRows.map((r) => (r.status === "out_of_scope" ? 1 : 0))),
    latency_p50_ms: Math.round(quantile(latencies, 0.5) * 10) / 10,
    latency_p95_ms: Math.round(quantile(latencies, 0.95) * 10) / 10,
    csat_proxy: Math.round(avg(mainRows.map((r) => r.csat_proxy)) * 100) / 100,
    heldout_category_accuracy: avg(heldoutRows.map((r) => (r.cat_ok ? 1 : 0))),
    heldout_routing_accuracy: avg(heldoutRows.map((r) => (r.route_ok ? 1 : 0))),
    security_false_negatives: rows.filter((r) => r.security_false_negative).length,
  };

  return { rows, metrics };
}
