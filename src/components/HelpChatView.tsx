import React, { useState, useRef, useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cpu,
  ExternalLink,
  Lock,
  Phone,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Ticket as TicketIcon,
  UserCheck,
  Wifi,
  KeyRound,
  Monitor,
  Printer,
  X,
} from "lucide-react";
import type { HelpDeskState, KBArticle, RunMode } from "../types";

interface ChatTurn {
  id: string;
  rawInput: string;
  state: HelpDeskState;
  feedbackGiven?: "fixed" | "escalated";
}

interface HelpChatViewProps {
  services: Record<string, string>;
  geminiAvailable: boolean;
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  onOpenTicketQueue: () => void;
  onInspectKBArticle: (docId: string) => void;
  kbArticles: KBArticle[];
  externalHumanTrigger: number;
}

const COMMON_ISSUES = [
  {
    title: "Wi-Fi or VPN",
    subtitle: "Drops, no internet",
    icon: Wifi,
    prompt: "The wifi in the library keeps disconnecting every few minutes on my laptop",
  },
  {
    title: "Password",
    subtitle: "Reset, locked out",
    icon: KeyRound,
    prompt: "I'm locked out of my account after too many tries and my essay is due tonight",
  },
  {
    title: "Software",
    subtitle: "Office, Adobe, SPSS",
    icon: Monitor,
    prompt: "Adobe Photoshop says I don't have a license but I'm in the design class",
  },
  {
    title: "Printing",
    subtitle: "Stuck jobs, costs",
    icon: Printer,
    prompt: "How do I print from my laptop and how much is color?",
  },
];

const DEMO_SCENARIOS = [
  {
    label: "1. Wi-Fi drops (Diagnostics → Resolved)",
    query: "The wifi in the library keeps disconnecting every few minutes on my laptop",
  },
  {
    label: "2. Locked out before deadline (Unlock → Resolved)",
    query: "I'm locked out of my account after too many tries and my essay is due tonight",
  },
  {
    label: "3. Exam-day disabled + ID (P1 Fast Lane → Escalated)",
    query: "My account says DISABLED and my online final exam starts in 20 minutes! My ID is 014562233",
  },
  {
    label: "4. Phishing + Password (P1 Security + Redaction)",
    query: "I clicked a link in an email and typed my password on a weird login page. My password is Spartan#2026",
  },
  {
    label: "5. How-to printing (Pure RAG → Resolved)",
    query: "How do I print from my laptop and how much is color?",
  },
  {
    label: "6. Off-topic pizza (No guessing → Out of Scope)",
    query: "What's the best pizza place near campus?",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  network: "Wi-Fi & Network",
  authentication: "Account",
  software: "Software",
  hardware: "Hardware",
  email: "Campus Email",
  printing: "Printing",
  learning_platform: "Canvas",
  security: "Security",
  other: "Out of scope",
};

const NODE_LABELS: Array<{ id: string; label: string; role: string }> = [
  { id: "privacy_guard", label: "Privacy Guard", role: "PII regex redaction" },
  { id: "intake", label: "Intake Agent", role: "Category, P1-P4, workflow" },
  { id: "knowledge", label: "Knowledge Agent", role: "RAG + citation floor" },
  { id: "workflow", label: "Workflow Agent", role: "MCP automation + ticket" },
  { id: "escalation", label: "Escalation Agent", role: "Policy rules + handoff" },
  { id: "responder", label: "Responder", role: "Plain-language output" },
];

export default function HelpChatView({
  services,
  geminiAvailable,
  mode,
  onModeChange,
  onOpenTicketQueue,
  kbArticles,
  externalHumanTrigger,
}: HelpChatViewProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<KBArticle | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeTurn = turns.find((t) => t.id === activeTurnId) ?? turns[turns.length - 1] ?? null;
  const allOperational = Object.values(services).every((s) => s === "operational");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  useEffect(() => {
    if (externalHumanTrigger > 0) {
      handleTalkToPerson();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalHumanTrigger]);

  async function submitQuery(rawQuery: string, forceHuman = false) {
    const trimmed = rawQuery.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          userId: "student_001",
          mode,
          forceHuman,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }
      const data: HelpDeskState = await res.json();
      const id = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setTurns((prev) => [...prev, { id, rawInput: trimmed, state: data }]);
      setActiveTurnId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process request");
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(turnId: string, kind: "fixed" | "escalated") {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;

    if (turn.state.ticket_id) {
      try {
        await fetch(`/api/tickets/${turn.state.ticket_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "fixed"
              ? { status: "resolved", notes: "Confirmed fixed by student", csat: 5 }
              : {
                  status: "escalated",
                  notes: `Student clicked 'No, get a person' after AI steps. Issue: ${turn.state.query}`,
                  csat: 3,
                }
          ),
        });
      } catch {
        // Non-blocking UI feedback update
      }
    }

    if (kind === "escalated") {
      // Also run a human handoff turn if user asked for a person
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                feedbackGiven: "escalated",
                state: {
                  ...t.state,
                  escalated: true,
                  status: "escalated",
                  escalation: t.state.escalation ?? {
                    reasons: ["user requested a person"],
                    team:
                      t.state.category === "network"
                        ? "networking"
                        : t.state.category === "authentication"
                        ? "accounts"
                        : "service_desk",
                    channel: "ticket portal",
                    sla: t.state.severity === "P2" ? "4 hours" : "1 business day",
                    handoff: `Escalated from self-service by student. Steps already attempted: ${t.state.citations.join(", ") || "none"}.`,
                  },
                },
              }
            : t
        )
      );
    } else {
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, feedbackGiven: "fixed" } : t))
      );
    }
  }

  function handleTalkToPerson() {
    if (turns.length === 0) {
      setShowCallModal(true);
      return;
    }
    const last = turns[turns.length - 1];
    if (last.state.escalated) {
      setShowCallModal(true);
      return;
    }
    submitQuery(
      `I need to talk to a real person about my previous issue: ${last.state.query}`,
      true
    );
  }

  function handleReset() {
    setTurns([]);
    setActiveTurnId(null);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  }

  function openArticle(docId: string) {
    const found = kbArticles.find((a) => a.id === docId);
    if (found) setPreviewArticle(found);
  }

  const latestTurn = turns[turns.length - 1] ?? null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-24 md:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Main Help Desk Chat Column */}
        <section
          aria-label="SpartanAssist Help Chat"
          className="lg:col-span-7 xl:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-[640px]"
        >
          {/* Chat Workspace Subheader */}
          <div className="px-5 py-3.5 bg-[#0055A2] text-white flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-display font-bold text-base tracking-tight">
                Campus IT Help Desk
              </div>
              <div className="text-xs text-blue-100 truncate">
                Answers in seconds, 24/7 · Simulated SJSU IT support
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  New chat
                </button>
              )}
              <button
                type="button"
                onClick={handleTalkToPerson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/40 hover:bg-white/15 text-white transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
              >
                Talk to a person
              </button>
            </div>
          </div>

          {/* Live Service Status Strip or Escalation Banner */}
          {latestTurn?.state.escalated && latestTurn.state.escalation ? (
            <div
              role="status"
              className="px-5 py-3.5 bg-amber-50 border-b border-amber-200 flex items-start gap-3"
            >
              <UserCheck className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-amber-950">
                  A person is taking over
                </div>
                <div className="text-xs text-amber-900 mt-0.5">
                  <span className="capitalize">{latestTurn.state.escalation.team.replace(/_/g, " ")}</span>{" "}
                  team <span aria-hidden="true">·</span> {latestTurn.state.escalation.channel}{" "}
                  <span aria-hidden="true">·</span> response within {latestTurn.state.escalation.sla}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                {allOperational
                  ? "All services operational · Wi-Fi, VPN, Canvas, Email, Printing"
                  : "Service check complete · View details in Staff Console"}
              </span>
            </div>
          )}

          {/* Scrollable Conversation Area */}
          <div className="flex-1 p-5 space-y-6 overflow-y-auto max-h-[560px] bg-slate-50/50">
            {turns.length === 0 ? (
              <div className="space-y-6">
                {/* Greeting Bubble */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 max-w-xl">
                  <p className="text-[15px] leading-relaxed text-slate-800">
                    Hi! I&apos;m SpartanAssist. Tell me what&apos;s going wrong in your own words,
                    or pick a common issue below.
                  </p>
                </div>

                {/* Common Issues 2x2 Grid */}
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 tracking-wide mb-3">
                    Common issues
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {COMMON_ISSUES.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.title}
                          type="button"
                          onClick={() => submitQuery(item.prompt)}
                          disabled={loading}
                          className="group text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0055A2]/40 rounded-xl p-3.5 min-h-[56px] transition-colors flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-[#0055A2]"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0055A2] flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 group-hover:text-[#0055A2] transition-colors">
                              {item.title}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{item.subtitle}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* High-intent Security Alert Button */}
                <button
                  type="button"
                  onClick={() =>
                    submitQuery(
                      "I clicked a link in an email and typed my password on a weird login page. My password is Spartan#2026"
                    )
                  }
                  disabled={loading}
                  className="w-full min-h-[48px] px-4 py-3 bg-white hover:bg-red-50/70 border border-red-300 rounded-xl text-red-800 font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-red-600"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Report a suspicious email or hacked account</span>
                </button>

                {/* Privacy Guard Notice */}
                <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Never type your password here. I hide student IDs, emails, phone numbers, and
                    passwords automatically before any model or ticket sees them.
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {turns.map((turn) => {
                  const s = turn.state;
                  const isSelected = activeTurn?.id === turn.id;
                  const isEscalated = s.status === "escalated";
                  const isOutOfScope = s.status === "out_of_scope";
                  const catLabel = CATEGORY_LABELS[s.category] ?? s.category;
                  const latencyDisplay =
                    s.latency_ms >= 1000
                      ? `${(s.latency_ms / 1000).toFixed(1)} s`
                      : `${Math.round(s.latency_ms)} ms`;

                  return (
                    <div
                      key={turn.id}
                      onClick={() => setActiveTurnId(turn.id)}
                      className="space-y-3"
                    >
                      {/* Student User Bubble (shows redacted query!) */}
                      <div className="flex justify-end">
                        <div className="max-w-[85%] bg-[#0055A2] text-white px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed">
                          {s.query}
                        </div>
                      </div>

                      {/* Assistant Main Answer Card */}
                      <div
                        className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-4 transition-colors ${
                          isSelected ? "border-slate-300" : "border-slate-200"
                        }`}
                      >
                        {/* Unboxed Metadata Line (Zero-Pill Rule) */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            {isEscalated ? (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
                                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                With a person
                              </span>
                            ) : isOutOfScope ? (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                                Out of scope
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                Resolved
                              </span>
                            )}
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-slate-600 font-medium">{catLabel}</span>
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {s.severity}
                            </span>
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-slate-500">
                              {latencyDisplay}
                            </span>
                          </div>
                          {turns.length > 1 && (
                            <span className="text-[11px] text-slate-400">
                              {isSelected ? "Inspecting trace" : "Click to inspect"}
                            </span>
                          )}
                        </div>

                        {/* Body & Action Steps */}
                        {isOutOfScope ? (
                          <p className="text-sm text-slate-700 leading-relaxed">
                            I can only help with campus IT topics (Wi-Fi, accounts, software,
                            devices, email, printing, Canvas). For anything else, the campus info
                            line can point you in the right direction.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {isEscalated && s.escalation && (
                              <p className="text-sm text-slate-800 leading-relaxed">
                                {s.category === "security" ? (
                                  <>
                                    Possible account security issues must be reviewed by an analyst
                                    right away. I&apos;ve sent your case to{" "}
                                    <span className="font-semibold">
                                      {s.escalation.team.replace(/_/g, " ")}
                                    </span>{" "}
                                    as top priority with everything they need.
                                  </>
                                ) : s.query.toLowerCase().includes("disabled") ? (
                                  <>
                                    A <strong className="font-semibold">disabled</strong> account is
                                    an administrative hold, so I can&apos;t unlock it myself.
                                    I&apos;ve sent your case to the Accounts team as top priority
                                    with everything they need.
                                  </>
                                ) : (
                                  <>
                                    I&apos;ve routed your case to the{" "}
                                    <span className="font-semibold">
                                      {s.escalation.team.replace(/_/g, " ")}
                                    </span>{" "}
                                    team via {s.escalation.channel} (target response:{" "}
                                    {s.escalation.sla}).
                                  </>
                                )}
                              </p>
                            )}

                            {s.steps.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-sm font-semibold text-slate-900">
                                  {isEscalated
                                    ? "Do this now"
                                    : s.retrieved[0]?.section
                                    ? `Here's what to do — ${s.retrieved[0].section}:`
                                    : "Steps to resolve:"}
                                </div>
                                <ol className="space-y-1.5 text-sm text-slate-700 list-decimal pl-5 leading-relaxed">
                                  {s.steps.map((step, idx) => (
                                    <li key={idx}>{step}</li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {!s.grounded && s.category !== "other" && (
                              <p className="text-sm text-slate-600">
                                I didn&apos;t find a confident match in our knowledge base, so I
                                routed this to a technician instead of guessing.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Grounded KB Citation Link */}
                        {s.citations.length > 0 && (
                          <div className="pt-1 flex flex-wrap items-center gap-3">
                            {s.citations.map((docId) => {
                              const chunk = s.retrieved.find((r) => r.doc_id === docId);
                              return (
                                <button
                                  key={docId}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openArticle(docId);
                                  }}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0055A2] hover:text-[#004482] hover:underline focus-visible:outline-2 focus-visible:outline-[#0055A2]"
                                >
                                  <BookOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                  <span>
                                    Source: {docId}
                                    {chunk ? ` · ${chunk.section}` : ""}
                                  </span>
                                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Done-for-you Automation Card */}
                      {s.workflow_result?.message && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
                          {s.workflow_result.success ? (
                            <CheckCircle2
                              className="w-5 h-5 text-[#0055A2] shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertTriangle
                              className="w-5 h-5 text-amber-700 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="text-sm font-semibold text-slate-900">
                              Done for you:{" "}
                              <span className="font-normal text-slate-700">
                                {s.workflow.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">
                              {s.workflow_result.message}
                            </p>
                            {s.workflow_result.results && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs font-mono tabular-nums text-slate-600">
                                {Object.entries(s.workflow_result.results).map(([k, v]) => (
                                  <div key={k} className="bg-slate-50 px-2.5 py-1.5 rounded-lg">
                                    <span className="text-slate-400">{k}:</span>{" "}
                                    <span className="text-slate-800 font-medium">{v}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Ticket & Escalation / Feedback Cards */}
                      {s.ticket_id && isEscalated && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs text-slate-500">Your ticket</div>
                              <div className="font-mono tabular-nums font-bold text-lg text-slate-900 mt-0.5">
                                {s.ticket_id}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                Quote this if you call ({s.escalation?.channel ?? "help desk"})
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTicketQueue();
                              }}
                              className="text-xs font-medium text-[#0055A2] hover:underline whitespace-nowrap"
                            >
                              View in Staff Queue →
                            </button>
                          </div>
                          {s.severity === "P1" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowCallModal(true);
                              }}
                              className="w-full min-h-[44px] px-4 py-2.5 bg-[#0055A2] hover:bg-[#004482] text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
                            >
                              <Phone className="w-4 h-4" aria-hidden="true" />
                              <span>Call the help desk now</span>
                            </button>
                          )}
                        </div>
                      )}

                      {s.ticket_id && !isEscalated && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <TicketIcon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                              <span>
                                Ticket{" "}
                                <strong className="font-mono tabular-nums text-slate-900">
                                  {s.ticket_id}
                                </strong>{" "}
                                · closes automatically if this fixes it
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTicketQueue();
                              }}
                              className="text-[#0055A2] hover:underline font-medium"
                            >
                              Staff Queue →
                            </button>
                          </div>

                          {/* Did this fix it? */}
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                            <div className="text-sm font-semibold text-slate-900">
                              Did this fix it?
                            </div>
                            {turn.feedbackGiven === "fixed" ? (
                              <div className="text-sm text-emerald-700 font-medium flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                <span>Glad that worked! Ticket {s.ticket_id} marked resolved.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFeedback(turn.id, "fixed");
                                  }}
                                  className="min-h-[44px] px-4 py-2 bg-[#0055A2] hover:bg-[#004482] text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                                >
                                  Yes, fixed
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFeedback(turn.id, "escalated");
                                  }}
                                  className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-[#0055A2] text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                                >
                                  No, get a person
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Privacy Feedback Notice */}
                      {s.pii_found.length > 0 && (
                        <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex items-start gap-2.5">
                          <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>
                            I hid the personal details you typed ({s.pii_found.join(", ")}). Never
                            share passwords, including with me.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {loading && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                    <div className="text-xs font-medium text-slate-500">
                      Running Privacy Guard → Intake → Knowledge RAG → Workflow...
                    </div>
                    <div className="h-3 w-3/4 bg-slate-100 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {error && (
            <div className="px-5 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Persistent Bottom Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitQuery(input);
            }}
            className="p-4 bg-white border-t border-slate-200 space-y-2.5"
          >
            <div className="flex items-center gap-2.5">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your issue..."
                aria-label="Describe your IT issue"
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0055A2] focus:bg-white transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#0055A2] hover:bg-[#004482] disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#0055A2]"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>Engine:</span>
                <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onModeChange("gemini")}
                    disabled={!geminiAvailable}
                    title={
                      geminiAvailable
                        ? "Use Gemini 4 Hydrogen + Gemini Embeddings"
                        : "Gemini API key not configured on server"
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      mode === "gemini"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 disabled:opacity-40"
                    }`}
                  >
                    Gemini 4
                  </button>
                  <button
                    type="button"
                    onClick={() => onModeChange("offline")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      mode === "offline"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Offline Rules + TF-IDF
                  </button>
                </div>
              </div>
              <span className="text-[11px] text-slate-400">
                {mode === "gemini" ? "Structured output + RAG citations" : "Deterministic local mode"}
              </span>
            </div>
          </form>
        </section>

        {/* Right Column: Live Multi-Agent Routing Inspector & Demo Launcher */}
        <aside className="lg:col-span-5 xl:col-span-5 space-y-5">
          {/* Quick Capstone Demo Launcher */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-sm text-slate-900">
                Capstone Demo Scenarios
              </h2>
              <span className="text-xs text-slate-500">One per LangGraph route</span>
            </div>
            <div className="space-y-1.5">
              {DEMO_SCENARIOS.map((demo) => (
                <button
                  key={demo.label}
                  type="button"
                  onClick={() => submitQuery(demo.query)}
                  disabled={loading}
                  className="w-full text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-[#0055A2]/40 hover:bg-slate-50 text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="truncate">{demo.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {/* Live 6-Node State Trace */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-sm text-slate-900">
                Multi-Agent State Trace
              </h2>
              {activeTurn ? (
                <span className="font-mono tabular-nums text-xs text-slate-500">
                  {activeTurn.state.mode_used} · {Math.round(activeTurn.state.latency_ms)} ms
                </span>
              ) : (
                <span className="text-xs text-slate-400">Waiting for query</span>
              )}
            </div>

            {activeTurn ? (
              <div className="space-y-4">
                {activeTurn.state.fallback_reason && (
                  <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                    Fell back to offline classifier: {activeTurn.state.fallback_reason}
                  </div>
                )}

                {/* 6 Nodes Timeline */}
                <div className="space-y-2">
                  {NODE_LABELS.map((node) => {
                    const ran = activeTurn.state.trace.includes(node.id);
                    const ms = activeTurn.state.timings[node.id];
                    return (
                      <div
                        key={node.id}
                        className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                          ran
                            ? "bg-slate-50 border-slate-200 text-slate-900"
                            : "bg-white border-slate-100 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {ran ? (
                            <ShieldCheck
                              className="w-4 h-4 text-[#0055A2] shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold">{node.label}</span>
                            <span className="text-slate-400 ml-1.5 hidden sm:inline">
                              · {node.role}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums shrink-0">
                          {ran && ms !== undefined ? `${ms.toFixed(1)} ms` : "skipped"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Intake & RAG Details */}
                <div className="border-t border-slate-100 pt-3.5 space-y-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 p-2.5 rounded-lg">
                      <div className="text-slate-500">Intake Category</div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {activeTurn.state.category} ({activeTurn.state.severity})
                      </div>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg">
                      <div className="text-slate-500">Confidence / Workflow</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5 truncate">
                        {activeTurn.state.confidence.toFixed(2)} · {activeTurn.state.workflow}
                      </div>
                    </div>
                  </div>

                  {/* Retrieved Chunks */}
                  <div>
                    <div className="text-slate-500 font-medium mb-1.5">
                      RAG Top-K Chunks (Similarity Floor)
                    </div>
                    {activeTurn.state.retrieved.length === 0 ? (
                      <div className="px-3 py-2 bg-slate-50 rounded-lg text-slate-500">
                        No chunks cleared threshold — hallucination guard prevented guessing.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {activeTurn.state.retrieved.map((hit) => (
                          <div
                            key={hit.chunk_id}
                            className="px-3 py-2 bg-slate-50 rounded-lg flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 truncate">
                              <span className="font-mono font-semibold text-[#0055A2]">
                                {hit.doc_id}
                              </span>{" "}
                              <span className="text-slate-700">{hit.section}</span>
                            </div>
                            <span className="font-mono tabular-nums text-slate-600 shrink-0">
                              sim {hit.similarity.toFixed(3)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Escalation Policy Rules */}
                  {activeTurn.state.escalation && (
                    <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                      <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                        Escalation Policy Fired
                      </div>
                      <div className="text-amber-900">
                        Reasons: {activeTurn.state.escalation.reasons.join(", ")}
                      </div>
                      <div className="text-amber-800 leading-relaxed">
                        Handoff: {activeTurn.state.escalation.handoff}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 leading-relaxed space-y-2 py-2">
                <p>
                  Send a message or click any Capstone Demo Scenario to inspect the 6-node
                  orchestration state in real time:
                </p>
                <ul className="space-y-1 list-disc pl-4 text-slate-600">
                  <li>Privacy Guard PII redaction before LLM/RAG</li>
                  <li>Intake classification &amp; priority rubric (P1–P4)</li>
                  <li>Chroma-style cosine similarity threshold &amp; citation check</li>
                  <li>MCP automation tools &amp; SQLite/JSON ticket logging</li>
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Accessible Call Help Desk Modal */}
      {showCallModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="helpdesk-contact-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="helpdesk-contact-title" className="font-display font-bold text-lg text-slate-900">
                  Campus IT Help Desk Contacts
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Policy KB-POL-01 · Simulated Campus IT</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCallModal(false)}
                aria-label="Close contact dialog"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="font-semibold text-amber-950">24/7 Priority 1 Phone Line</div>
                <div className="font-mono tabular-nums text-amber-900 mt-1">(408) 555-0119</div>
                <div className="text-xs text-amber-800 mt-1">
                  Target response: 15 minutes for exams, security incidents, or campus-wide outages.
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="font-semibold text-slate-900">Walk-In Support Desk</div>
                <div className="text-slate-700 mt-1">Monday–Friday · 8:00 AM – 6:00 PM</div>
                <div className="text-xs text-slate-500 mt-1">
                  Bring your campus ID and device for physical repairs or short-term loaners.
                </div>
              </div>
              {latestTurn?.state.ticket_id && (
                <div className="text-xs text-slate-600">
                  Quote your active ticket ID:{" "}
                  <strong className="font-mono text-slate-900">{latestTurn.state.ticket_id}</strong>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCallModal(false)}
                className="px-4 py-2 bg-[#0055A2] hover:bg-[#004482] text-white text-sm font-semibold rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KB Article Citation Preview Modal */}
      {previewArticle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kb-preview-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs font-semibold text-[#0055A2]">
                  {previewArticle.id} · {previewArticle.category}
                </div>
                <h3 id="kb-preview-title" className="font-display font-bold text-lg text-slate-900 mt-0.5">
                  {previewArticle.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewArticle(null)}
                aria-label="Close article preview"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {previewArticle.body.trim()}
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Simulated university IT knowledge base</span>
              <button
                type="button"
                onClick={() => setPreviewArticle(null)}
                className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
