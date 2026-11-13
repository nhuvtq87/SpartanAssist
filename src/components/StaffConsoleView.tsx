import React, { useState, useEffect } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Minus,
  Play,
  RefreshCw,
  Search,
  Server,
  Terminal,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import type { MCPToolDefinition, Severity, Ticket } from "../types";
import StaffAnalyticsDashboard from "./StaffAnalyticsDashboard";

type PriorityLevel = "High" | "Medium" | "Low";

function getPriorityMeta(priority: Severity): {
  level: PriorityLevel;
  colorClass: string;
  Icon: typeof ArrowUp;
} {
  if (priority === "P1") {
    return { level: "High", colorClass: "text-red-700", Icon: ArrowUp };
  }
  if (priority === "P2") {
    return { level: "High", colorClass: "text-amber-700", Icon: ArrowUp };
  }
  if (priority === "P3") {
    return { level: "Medium", colorClass: "text-[#0055A2]", Icon: Minus };
  }
  return { level: "Low", colorClass: "text-slate-500", Icon: ArrowDown };
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildTicketsCsv(rows: Ticket[]): string {
  const headers = [
    "id",
    "created",
    "user",
    "priority",
    "status",
    "category",
    "team",
    "sla",
    "summary",
    "notes",
    "csat",
    "escalation_reasons",
    "trace",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((t) =>
      [
        t.id,
        t.created,
        t.user,
        t.priority,
        t.status,
        t.category,
        t.team,
        t.sla,
        t.summary,
        t.notes,
        t.csat ?? "",
        (t.escalation_reasons ?? []).join("; "),
        (t.trace ?? []).join(" -> "),
      ]
        .map(escapeCsvCell)
        .join(",")
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface StaffConsoleViewProps {
  refreshTrigger?: number;
}

export default function StaffConsoleView({ refreshTrigger = 0 }: StaffConsoleViewProps) {
  const [subTab, setSubTab] = useState<"tickets" | "dashboard" | "mcp">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLevel>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // MCP Tool Console state
  const [tools, setTools] = useState<MCPToolDefinition[]>([]);
  const [serverInfo, setServerInfo] = useState<{
    name: string;
    protocolVersion: string;
    transport: string;
  } | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>("list_tickets");
  const [toolArgsText, setToolArgsText] = useState<string>('{\n  "status": "escalated",\n  "limit": 10\n}');
  const [toolOutput, setToolOutput] = useState<string>("");
  const [toolRunning, setToolRunning] = useState(false);

  async function fetchTickets(silent = false) {
    if (!silent) setLoadingTickets(true);
    try {
      const res = await fetch("/api/tickets?limit=100");
      const data = await res.json();
      const list: Ticket[] = data.tickets ?? [];
      setTickets(list);
      if (!selectedTicketId && list.length > 0) {
        setSelectedTicketId(list[0].id);
      }
    } finally {
      if (!silent) setLoadingTickets(false);
    }
  }

  async function fetchMcpTools() {
    const res = await fetch("/api/mcp/tools");
    const data = await res.json();
    setTools(data.tools ?? []);
    setServerInfo(data.serverInfo ?? null);
  }

  useEffect(() => {
    fetchTickets();
    fetchMcpTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchTickets(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  async function handleUpdateStatus(ticketId: string, newStatus: Ticket["status"]) {
    setUpdatingId(ticketId);
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchTickets();
    } finally {
      setUpdatingId(null);
    }
  }

  function handleSelectTool(toolName: string) {
    setSelectedTool(toolName);
    const def = tools.find((t) => t.name === toolName);
    if (def) {
      const defaults: Record<string, unknown> = {};
      for (const [k, prop] of Object.entries(def.inputSchema.properties)) {
        if (prop.default !== undefined) {
          defaults[k] = prop.default;
        } else if (prop.type === "number") {
          defaults[k] = 10;
        } else {
          defaults[k] = k === "summary" ? "Checked from Staff MCP Console" : "";
        }
      }
      setToolArgsText(JSON.stringify(defaults, null, 2));
    }
  }

  async function executeMcpTool() {
    setToolRunning(true);
    setToolOutput("");
    try {
      const parsed = JSON.parse(toolArgsText || "{}");
      const res = await fetch("/api/mcp/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedTool, arguments: parsed }),
      });
      const data = await res.json();
      setToolOutput(JSON.stringify(data, null, 2));
      if (["create_ticket", "update_ticket"].includes(selectedTool)) {
        await fetchTickets();
      }
    } catch (err) {
      setToolOutput(
        JSON.stringify(
          { ok: false, error: err instanceof Error ? err.message : "Invalid JSON arguments" },
          null,
          2
        )
      );
    } finally {
      setToolRunning(false);
    }
  }

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && getPriorityMeta(t.priority).level !== priorityFilter) {
      return false;
    }
    if (searchText.trim()) {
      const terms = searchText.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const haystack = [
        t.id,
        t.user,
        t.category,
        t.category.replace(/_/g, " "),
        t.team,
        t.team.replace(/_/g, " "),
        t.summary,
        t.notes,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    }
    return true;
  });

  const selectedTicket =
    filteredTickets.find((t) => t.id === selectedTicketId) ?? filteredTickets[0] ?? null;

  const p1EscalatedCount = tickets.filter(
    (t) => t.priority === "P1" && t.status === "escalated"
  ).length;
  const escalatedCount = tickets.filter((t) => t.status === "escalated").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  function handleExportTickets(format: "csv" | "json") {
    if (filteredTickets.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    const filename = `spartanassist-tickets-${stamp}.${format}`;

    if (format === "csv") {
      const csv = buildTicketsCsv(filteredTickets);
      triggerFileDownload(csv, filename, "text/csv;charset=utf-8;");
    } else {
      const payload = {
        exported_at: new Date().toISOString(),
        filters: {
          status: statusFilter,
          priority: priorityFilter,
          search: searchText.trim() || null,
        },
        count: filteredTickets.length,
        tickets: filteredTickets,
      };
      triggerFileDownload(
        JSON.stringify(payload, null, 2),
        filename,
        "application/json;charset=utf-8;"
      );
    }

    setExportNotice(
      `Exported ${filteredTickets.length} ticket${filteredTickets.length === 1 ? "" : "s"} as ${format.toUpperCase()}`
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 space-y-6">
      {/* Header + Sub-Tab Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 tracking-tight">
            Staff Queue &amp; MCP Console
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Technicians read escalated tickets with collected context and call the same MCP tools as
            the agents.
          </p>
        </div>
        <div className="inline-flex flex-wrap items-center p-1 bg-slate-200/70 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setSubTab("tickets")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === "tickets"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Ticket Queue ({tickets.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("dashboard")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === "dashboard"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Analytics Dashboard (30d)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("mcp")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === "mcp"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            MCP Tool Inspector ({tools.length})
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Escalated P1 (15m SLA)</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-red-700 mt-1">
            {p1EscalatedCount}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">With a Person (Escalated)</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-amber-700 mt-1">
            {escalatedCount}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Auto-Resolved by AI</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-emerald-700 mt-1">
            {resolvedCount}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Total Logged Tickets</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-slate-900 mt-1">
            {tickets.length}
          </div>
        </div>
      </div>

      {subTab === "tickets" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Ticket Table Column */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search user, ticket ID, or category keywords..."
                  aria-label="Search tickets by user name, ticket ID, or issue category"
                  className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0055A2] focus:bg-white transition-colors"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => setSearchText("")}
                    aria-label="Clear ticket search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {["all", "escalated", "resolved", "open"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
                      statusFilter === st
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <div
                role="group"
                aria-label="Filter by priority level"
                className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
              >
                {(["all", "High", "Medium", "Low"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    aria-pressed={priorityFilter === lvl}
                    onClick={() => setPriorityFilter(lvl)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                      priorityFilter === lvl
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {lvl === "all" ? "All Priority" : lvl}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => fetchTickets(false)}
                aria-label="Refresh tickets"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Reporting Export Bar */}
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-600 font-mono tabular-nums">
                Showing {filteredTickets.length} of {tickets.length} tickets
                {exportNotice ? (
                  <span className="text-emerald-700 font-sans font-medium ml-2">
                    · {exportNotice}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={filteredTickets.length === 0}
                  onClick={() => handleExportTickets("csv")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#0055A2]" aria-hidden="true" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  disabled={filteredTickets.length === 0}
                  onClick={() => handleExportTickets("json")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-semibold transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#0055A2]" aria-hidden="true" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            {loadingTickets ? (
              <div className="p-6 space-y-3">
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No tickets match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                      <th className="py-2.5 px-4">Ticket</th>
                      <th className="py-2.5 px-3">Priority</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Team</th>
                      <th className="py-2.5 px-4">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredTickets.map((t) => {
                      const active = selectedTicket?.id === t.id;
                      const pMeta = getPriorityMeta(t.priority);
                      const PriorityIcon = pMeta.Icon;
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTicketId(t.id)}
                          className={`cursor-pointer transition-colors ${
                            active ? "bg-blue-50/70" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-[#0055A2]">
                              {t.id}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{t.user}</div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${pMeta.colorClass}`}
                            >
                              <PriorityIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{pMeta.level}</span>
                              <span className="font-mono tabular-nums text-[11px] opacity-75">
                                ({t.priority})
                              </span>
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`font-medium capitalize ${
                                t.status === "escalated"
                                  ? "text-amber-800"
                                  : t.status === "resolved"
                                  ? "text-emerald-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                            {t.team.replace(/_/g, " ")}
                          </td>
                          <td className="py-3 px-4 text-slate-800 max-w-[240px] truncate">
                            {t.summary}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ticket Handoff Detail Column */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            {selectedTicket ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono tabular-nums text-sm font-bold text-[#0055A2]">
                      {selectedTicket.id}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      {selectedTicket.user} · {selectedTicket.created.replace("T", " ")} · SLA{" "}
                      {selectedTicket.sla}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold capitalize ${
                      getPriorityMeta(selectedTicket.priority).colorClass
                    }`}
                  >
                    <span>
                      {getPriorityMeta(selectedTicket.priority).level} ({selectedTicket.priority})
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={
                        selectedTicket.status === "escalated"
                          ? "text-amber-800"
                          : selectedTicket.status === "resolved"
                          ? "text-emerald-700"
                          : "text-slate-700"
                      }
                    >
                      {selectedTicket.status}
                    </span>
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">
                    Redacted Student Request
                  </div>
                  <p className="text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
                    {selectedTicket.summary}
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">
                    AI Handoff &amp; Audit Notes
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {selectedTicket.notes || "No handoff notes recorded."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl">
                    <div className="text-slate-500">Assigned Team</div>
                    <div className="font-semibold text-slate-900 capitalize mt-0.5">
                      {selectedTicket.team.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl">
                    <div className="text-slate-500">Category</div>
                    <div className="font-semibold text-slate-900 capitalize mt-0.5">
                      {selectedTicket.category.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>

                {selectedTicket.trace && selectedTicket.trace.length > 0 && (
                  <div className="text-xs">
                    <div className="text-slate-500 font-semibold mb-1">Agent Execution Path</div>
                    <div className="font-mono text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
                      {selectedTicket.trace.join(" → ")}
                    </div>
                  </div>
                )}

                {/* Staff Actions */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingId === selectedTicket.id || selectedTicket.status === "resolved"}
                    onClick={() => handleUpdateStatus(selectedTicket.id, "resolved")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Mark Resolved
                  </button>
                  <button
                    type="button"
                    disabled={
                      updatingId === selectedTicket.id || selectedTicket.status === "escalated"
                    }
                    onClick={() => handleUpdateStatus(selectedTicket.id, "escalated")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-100 hover:bg-amber-200 disabled:opacity-40 text-amber-950 transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    Escalate
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === selectedTicket.id || selectedTicket.status === "closed"}
                    onClick={() => handleUpdateStatus(selectedTicket.id, "closed")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-40 text-slate-700 transition-colors"
                  >
                    Close Ticket
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500 py-8 text-center">
                Select a ticket from the queue to inspect its handoff notes.
              </div>
            )}
          </div>
        </div>
      ) : subTab === "dashboard" ? (
        <StaffAnalyticsDashboard tickets={tickets} />
      ) : (
        /* MCP Tool Inspector */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
                <h2 className="font-display font-bold text-sm text-slate-900">
                  {serverInfo?.name ?? "spartanassist-helpdesk"}
                </h2>
              </div>
              <span className="font-mono text-xs text-slate-500">
                MCP {serverInfo?.protocolVersion ?? "2025-11-25"}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Discovered tools from the shared MCP tool registry. Both the Workflow Agent and staff
              clients (e.g., VS Code Copilot) invoke these identical schemas.
            </p>
            <div className="space-y-1.5">
              {tools.map((tool) => {
                const active = selectedTool === tool.name;
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => handleSelectTool(tool.name)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? "bg-blue-50/70 border-[#0055A2]/40"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 text-[#0055A2] shrink-0" aria-hidden="true" />
                      <span className="font-mono text-xs font-semibold text-slate-900">
                        {tool.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">{tool.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
                <h2 className="font-display font-bold text-sm text-slate-900">
                  Invoke Tool: <span className="font-mono text-[#0055A2]">{selectedTool}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={executeMcpTool}
                disabled={toolRunning}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0055A2] hover:bg-[#004482] text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{toolRunning ? "Executing..." : "Call MCP Tool"}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="mcp-args-json"
                className="block text-xs font-semibold text-slate-600"
              >
                Arguments (JSON Schema)
              </label>
              <textarea
                id="mcp-args-json"
                rows={7}
                value={toolArgsText}
                onChange={(e) => setToolArgsText(e.target.value)}
                className="w-full font-mono text-xs p-3.5 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 focus:outline-none focus:border-[#0055A2]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-600">Tool Response</div>
              <pre className="font-mono text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 overflow-x-auto min-h-[160px]">
                {toolOutput || "// Click 'Call MCP Tool' to execute against the live ticket store."}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
