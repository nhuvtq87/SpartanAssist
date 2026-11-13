import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Play,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { RunMode, ValidationMetrics, ValidationRow } from "../types";

interface ValidationLabViewProps {
  defaultMode: RunMode;
  geminiAvailable: boolean;
}

export default function ValidationLabView({
  defaultMode,
  geminiAvailable,
}: ValidationLabViewProps) {
  const [evalMode, setEvalMode] = useState<RunMode>("offline");
  const [securityFix, setSecurityFix] = useState<boolean>(true);
  const [suiteFilter, setSuiteFilter] = useState<"all" | "main" | "heldout">("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [metrics, setMetrics] = useState<ValidationMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSuite(modeToRun: RunMode, fixEnabled: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/validation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeToRun, securityFix: fixEnabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Validation suite failed");
      }
      const data = await res.json();
      setRows(data.rows ?? []);
      setMetrics(data.metrics ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run validation");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSuite("offline", true);
  }, []);

  const visibleRows =
    suiteFilter === "all" ? rows : rows.filter((r) => r.suite === suiteFilter);

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const kpiCards = metrics
    ? [
        {
          label: "Category Accuracy (Main 20)",
          value: pct(metrics.category_accuracy),
          target: ">= 85%",
          pass: metrics.category_accuracy >= 0.85,
        },
        {
          label: "Routing Accuracy (Main 20)",
          value: pct(metrics.routing_accuracy),
          target: ">= 85%",
          pass: metrics.routing_accuracy >= 0.85,
        },
        {
          label: "Retrieval Hit@2",
          value: pct(metrics.retrieval_hit_at_2),
          target: ">= 85%",
          pass: metrics.retrieval_hit_at_2 >= 0.85,
        },
        {
          label: "Grounded Answers",
          value: pct(metrics.grounded_answers),
          target: "100%",
          pass: metrics.grounded_answers >= 0.99,
        },
        {
          label: "Held-Out Generalization (10)",
          value: pct(metrics.heldout_routing_accuracy),
          target: ">= 85%",
          pass: metrics.heldout_routing_accuracy >= 0.85,
        },
        {
          label: "Security False Negatives",
          value: String(metrics.security_false_negatives),
          target: "0",
          pass: metrics.security_false_negatives === 0,
        },
        {
          label: "CSAT Proxy Score",
          value: `${metrics.csat_proxy.toFixed(2)} / 5.0`,
          target: ">= 4.2",
          pass: metrics.csat_proxy >= 4.2,
        },
        {
          label: "Latency p50 / p95",
          value: `${metrics.latency_p50_ms.toFixed(1)} / ${metrics.latency_p95_ms.toFixed(1)} ms`,
          target: "< 8,000 ms",
          pass: metrics.latency_p95_ms < 8000,
        },
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 tracking-tight">
            Capstone Validation Lab (30 Labeled Scenarios)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Evaluates the 6-node pipeline across 20 main scenarios (T01–T20) and 10 held-out
            phrasing tests (H01–H10) with live pass/miss metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Engine Toggle */}
          <div className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => {
                setEvalMode("offline");
                runSuite("offline", securityFix);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                evalMode === "offline"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Offline Rules + TF-IDF
            </button>
            <button
              type="button"
              disabled={!geminiAvailable}
              title={
                geminiAvailable
                  ? `Run 30 scenarios via ${defaultMode === "gemini" ? "Gemini 4 Hydrogen" : "Gemini"}`
                  : "Gemini API key not configured on server"
              }
              onClick={() => {
                setEvalMode("gemini");
                runSuite("gemini", securityFix);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                evalMode === "gemini"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 disabled:opacity-40"
              }`}
            >
              Gemini 4 + Embeddings
            </button>
          </div>

          {/* H09 Security Fix Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !securityFix;
              setSecurityFix(next);
              runSuite(evalMode, next);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
              securityFix
                ? "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100"
                : "bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100"
            }`}
          >
            {securityFix ? (
              <ShieldCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
            )}
            <span>H09 Takeover Fix: {securityFix ? "ON" : "OFF (Pre-Fix Baseline)"}</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => runSuite(evalMode, securityFix)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0055A2] hover:bg-[#004482] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{loading ? "Running 30 Scenarios..." : "Re-run Suite"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* H09 Security Finding Explanation Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3 text-sm ${
          securityFix
            ? "bg-white border-slate-200 text-slate-700"
            : "bg-amber-50 border-amber-300 text-amber-950"
        }`}
      >
        <FlaskConical
          className={`w-5 h-5 shrink-0 mt-0.5 ${
            securityFix ? "text-[#0055A2]" : "text-amber-800"
          }`}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <div className="font-semibold">
            {securityFix
              ? "H09 Account-Takeover Rule Active (0 Security False Negatives)"
              : "Pre-Fix Baseline Active — Reproducing Report Finding H09"}
          </div>
          <p className="text-xs leading-relaxed opacity-90">
            In the capstone validation report, held-out scenario{" "}
            <span className="font-mono font-semibold">H09</span> (&ldquo;someone is sending emails
            from my account asking for gift cards&rdquo;) initially routed to{" "}
            <span className="font-mono">email</span> instead of{" "}
            <span className="font-mono">security</span> because it lacked &ldquo;phishing&rdquo; or
            &ldquo;hacked&rdquo; keywords. Adding the account-takeover cues in{" "}
            <span className="font-mono">classifyOffline</span> resolves H09 to{" "}
            <span className="font-mono">security / P1 / escalated</span>. Toggle the switch above
            to compare before and after.
          </p>
        </div>
      </div>

      {/* Headline Metrics Grid */}
      {metrics && (
        <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {kpiCards.slice(0, 4).map((k) => (
            <div key={k.label} className="p-4 sm:p-5 space-y-1">
              <div className="text-xs text-slate-500 font-medium">{k.label}</div>
              <div className="font-mono tabular-nums font-bold text-2xl text-slate-900">
                {k.value}
              </div>
              <div
                className={`text-xs font-medium flex items-center gap-1 ${
                  k.pass ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {k.pass ? (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Target {k.target}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {metrics && (
        <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {kpiCards.slice(4, 8).map((k) => (
            <div key={k.label} className="p-4 sm:p-5 space-y-1">
              <div className="text-xs text-slate-500 font-medium">{k.label}</div>
              <div className="font-mono tabular-nums font-bold text-xl text-slate-900">
                {k.value}
              </div>
              <div
                className={`text-xs font-medium flex items-center gap-1 ${
                  k.pass ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {k.pass ? (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Target {k.target}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparison vs Sample Baseline Notebook */}
      {metrics && (
        <section
          aria-label="Baseline Comparison"
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-bold text-base text-slate-900">
              SpartanAssist vs. Sample Notebook Baseline
            </h2>
            <span className="text-xs text-slate-500">
              Outcome mix (Main 20): {pct(metrics.auto_resolved_rate)} resolved ·{" "}
              {pct(metrics.escalated_rate)} escalated · {pct(metrics.out_of_scope_rate)} out of scope
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-3 px-5">Evaluation Dimension</th>
                  <th className="py-3 px-4">Sample Notebook Baseline</th>
                  <th className="py-3 px-4">SpartanAssist Multi-Agent ({metrics.mode})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 px-5 font-medium text-slate-900">Auto-resolved rate</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                    0% (escalated every request)
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums font-semibold text-emerald-700">
                    {pct(metrics.auto_resolved_rate)} ({Math.round(metrics.auto_resolved_rate * 20)}/20)
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-medium text-slate-900">Escalated to human</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">100%</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                    {pct(metrics.escalated_rate)} ({Math.round(metrics.escalated_rate * 20)}/20)
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-medium text-slate-900">Grounded KB citations</td>
                  <td className="py-3 px-4 text-slate-500">None (no vector RAG)</td>
                  <td className="py-3 px-4 font-mono tabular-nums font-semibold text-emerald-700">
                    {pct(metrics.grounded_answers)} verified chunks
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-medium text-slate-900">PII Privacy Guard</td>
                  <td className="py-3 px-4 text-slate-500">None (raw IDs &amp; passwords logged)</td>
                  <td className="py-3 px-4 font-semibold text-[#0055A2]">
                    Regex redaction before LLM, RAG &amp; ticket log
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-medium text-slate-900">Median response latency</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">16,500 ms</td>
                  <td className="py-3 px-4 font-mono tabular-nums font-semibold text-emerald-700">
                    {metrics.latency_p50_ms.toFixed(1)} ms p50
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Full 30-Row Scenario Table */}
      <section
        aria-label="Scenario Results Table"
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold text-base text-slate-900">
            Scenario Breakdown ({visibleRows.length})
          </h2>
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl text-xs">
            {(
              [
                { id: "all", label: `All (${rows.length})` },
                { id: "main", label: "Main T01–T20" },
                { id: "heldout", label: "Held-Out H01–H10" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSuiteFilter(tab.id)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  suiteFilter === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-3">Suite</th>
                <th className="py-2.5 px-3">Student Query</th>
                <th className="py-2.5 px-3">Category (Exp / Got)</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Status (Exp / Got)</th>
                <th className="py-2.5 px-3">Retrieved</th>
                <th className="py-2.5 px-4 text-right">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.map((row) => {
                const allOk = row.cat_ok && row.route_ok && !row.security_false_negative;
                return (
                  <tr
                    key={row.id}
                    className={row.security_false_negative ? "bg-red-50/60" : "hover:bg-slate-50/70"}
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {allOk ? (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-emerald-700 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" aria-hidden="true" />
                        )}
                        {row.id}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 capitalize whitespace-nowrap">
                      {row.suite}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 max-w-[280px]">{row.query}</td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <span className={row.cat_ok ? "text-emerald-700" : "text-red-700 font-semibold"}>
                        {row.exp_category} / {row.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                      {row.exp_severity ? `${row.exp_severity} / ${row.severity}` : row.severity}
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <span className={row.route_ok ? "text-emerald-700" : "text-red-700 font-semibold"}>
                        {row.exp_status} / {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {row.retrieved.length > 0 ? row.retrieved.join(", ") : "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-500 whitespace-nowrap">
                      {row.latency_ms.toFixed(1)} ms
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
