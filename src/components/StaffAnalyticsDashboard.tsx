import React, { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Clock, Info, Users } from "lucide-react";
import type { Ticket } from "../types";

interface StaffAnalyticsDashboardProps {
  tickets: Ticket[];
}

interface DailyResolutionPoint {
  dateKey: string;
  label: string;
  totalTickets: number;
  aiTickets: number;
  humanTickets: number;
  avgResolutionMin: number;
  aiAvgMin: number | null;
  humanAvgMin: number | null;
}

interface TeamWorkloadPoint {
  teamKey: string;
  teamLabel: string;
  resolved: number;
  escalated: number;
  open: number;
  total: number;
  highPriority: number;
  avgResolutionMin: number;
}

const TEAM_LABELS: Record<string, string> = {
  accounts: "Accounts",
  networking: "Networking",
  security_ops: "Security Ops",
  desktop_support: "Desktop Support",
  software_licensing: "Software Licensing",
  academic_tech: "Academic Tech",
  collaboration: "Collaboration",
  service_desk: "Service Desk",
};

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function estimateResolutionMinutes(ticket: Ticket): number {
  if (typeof ticket.resolution_minutes === "number" && ticket.resolution_minutes > 0) {
    return ticket.resolution_minutes;
  }
  if (ticket.notes.toLowerCase().includes("auto-resolved")) {
    return 0.5;
  }
  if (ticket.priority === "P1") return 13;
  if (ticket.priority === "P2") return 42;
  if (ticket.priority === "P3") return 110;
  return 185;
}

function isAiResolved(ticket: Ticket): boolean {
  return (
    ticket.status === "resolved" &&
    (ticket.notes.toLowerCase().includes("auto-resolved") ||
      ticket.notes.toLowerCase().includes("confirmed fixed"))
  );
}

/**
 * Generates deterministic 29-day historical simulated campus tickets anchored
 * before `anchorDate` so 30-day trend & workload charts show full month dynamics
 * alongside all live tickets persisted in tickets.json.
 */
function buildHistoricalBaseline(anchorDate: Date): Ticket[] {
  const templates: Array<{
    daysAgo: number;
    category: string;
    team: string;
    priority: Ticket["priority"];
    status: Ticket["status"];
    aiResolved: boolean;
    resMin: number;
  }> = [
    { daysAgo: 29, category: "network", team: "networking", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.6 },
    { daysAgo: 28, category: "authentication", team: "accounts", priority: "P2", status: "resolved", aiResolved: true, resMin: 0.5 },
    { daysAgo: 27, category: "software", team: "software_licensing", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.8 },
    { daysAgo: 26, category: "hardware", team: "desktop_support", priority: "P3", status: "escalated", aiResolved: false, resMin: 145 },
    { daysAgo: 25, category: "printing", team: "desktop_support", priority: "P4", status: "resolved", aiResolved: true, resMin: 0.7 },
    { daysAgo: 24, category: "learning_platform", team: "academic_tech", priority: "P2", status: "resolved", aiResolved: true, resMin: 0.5 },
    { daysAgo: 23, category: "email", team: "collaboration", priority: "P4", status: "resolved", aiResolved: true, resMin: 0.6 },
    { daysAgo: 22, category: "security", team: "security_ops", priority: "P1", status: "resolved", aiResolved: false, resMin: 12 },
    { daysAgo: 21, category: "network", team: "networking", priority: "P1", status: "resolved", aiResolved: false, resMin: 14 },
    { daysAgo: 20, category: "authentication", team: "accounts", priority: "P2", status: "resolved", aiResolved: true, resMin: 0.4 },
    { daysAgo: 19, category: "software", team: "software_licensing", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.9 },
    { daysAgo: 18, category: "hardware", team: "desktop_support", priority: "P3", status: "closed", aiResolved: false, resMin: 125 },
    { daysAgo: 17, category: "network", team: "networking", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.5 },
    { daysAgo: 16, category: "learning_platform", team: "academic_tech", priority: "P2", status: "escalated", aiResolved: false, resMin: 48 },
    { daysAgo: 15, category: "authentication", team: "accounts", priority: "P1", status: "resolved", aiResolved: false, resMin: 11 },
    { daysAgo: 14, category: "email", team: "collaboration", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.6 },
    { daysAgo: 13, category: "network", team: "networking", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.5 },
    { daysAgo: 12, category: "printing", team: "desktop_support", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.8 },
    { daysAgo: 11, category: "software", team: "software_licensing", priority: "P4", status: "resolved", aiResolved: true, resMin: 0.7 },
    { daysAgo: 10, category: "security", team: "security_ops", priority: "P1", status: "escalated", aiResolved: false, resMin: 14 },
    { daysAgo: 9, category: "authentication", team: "accounts", priority: "P2", status: "resolved", aiResolved: true, resMin: 0.5 },
    { daysAgo: 8, category: "network", team: "networking", priority: "P2", status: "escalated", aiResolved: false, resMin: 44 },
    { daysAgo: 7, category: "learning_platform", team: "academic_tech", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.6 },
    { daysAgo: 6, category: "hardware", team: "desktop_support", priority: "P3", status: "resolved", aiResolved: false, resMin: 95 },
    { daysAgo: 5, category: "authentication", team: "accounts", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.5 },
    { daysAgo: 4, category: "email", team: "collaboration", priority: "P4", status: "resolved", aiResolved: true, resMin: 0.7 },
    { daysAgo: 3, category: "network", team: "networking", priority: "P3", status: "resolved", aiResolved: true, resMin: 0.4 },
    { daysAgo: 2, category: "software", team: "software_licensing", priority: "P2", status: "escalated", aiResolved: false, resMin: 39 },
    { daysAgo: 1, category: "security", team: "security_ops", priority: "P1", status: "resolved", aiResolved: false, resMin: 13 },
    { daysAgo: 1, category: "authentication", team: "accounts", priority: "P2", status: "resolved", aiResolved: true, resMin: 0.5 },
  ];

  return templates.map((item, idx) => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - item.daysAgo);
    const isoDate = toDateKey(d);
    return {
      id: `HIST-30D-${String(idx + 1).padStart(2, "0")}`,
      created: `${isoDate}T10:15:00`,
      resolved_at: `${isoDate}T10:30:00`,
      resolution_minutes: item.resMin,
      user: `student_${200 + idx}`,
      category: item.category,
      priority: item.priority,
      summary: `Historical 30-day ${item.category} case`,
      status: item.status,
      team: item.team,
      notes: item.aiResolved
        ? "auto-resolved by SpartanAssist"
        : `Handled by ${item.team.replace(/_/g, " ")} specialist`,
      sla: item.priority === "P1" ? "15 minutes" : "4 hours",
    };
  });
}

export default function StaffAnalyticsDashboard({ tickets }: StaffAnalyticsDashboardProps) {
  const [scope, setScope] = useState<"combined" | "live">("combined");

  const analytics = useMemo(() => {
    // Anchor the 30-day window to the newest ticket date (or current date if later)
    const now = new Date();
    let anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const t of tickets) {
      const parsed = new Date(t.created.slice(0, 10) + "T00:00:00");
      if (!Number.isNaN(parsed.getTime()) && parsed > anchor) {
        anchor = parsed;
      }
    }

    const windowStart = new Date(anchor);
    windowStart.setDate(windowStart.getDate() - 29);

    const combinedTickets =
      scope === "combined" ? [...tickets, ...buildHistoricalBaseline(anchor)] : [...tickets];

    const dateKeys: Array<{ key: string; label: string }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      dateKeys.push({ key: toDateKey(d), label: formatShortDate(d) });
    }
    const validKeySet = new Set(dateKeys.map((d) => d.key));

    const inWindowTickets = combinedTickets.filter((t) => {
      const key = t.created.slice(0, 10);
      return validKeySet.has(key);
    });

    // Build daily resolution time series (30 days)
    const dailyMap = new Map<string, Ticket[]>();
    for (const d of dateKeys) {
      dailyMap.set(d.key, []);
    }
    for (const t of inWindowTickets) {
      const key = t.created.slice(0, 10);
      const arr = dailyMap.get(key);
      if (arr) arr.push(t);
    }

    const dailySeries: DailyResolutionPoint[] = dateKeys.map(({ key, label }) => {
      const dayTickets = dailyMap.get(key) ?? [];
      const aiMins: number[] = [];
      const humanMins: number[] = [];
      const allMins: number[] = [];

      for (const t of dayTickets) {
        const mins = estimateResolutionMinutes(t);
        allMins.push(mins);
        if (isAiResolved(t)) {
          aiMins.push(mins);
        } else {
          humanMins.push(mins);
        }
      }

      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

      return {
        dateKey: key,
        label,
        totalTickets: dayTickets.length,
        aiTickets: aiMins.length,
        humanTickets: humanMins.length,
        avgResolutionMin: avg(allMins),
        aiAvgMin: aiMins.length > 0 ? avg(aiMins) : null,
        humanAvgMin: humanMins.length > 0 ? avg(humanMins) : null,
      };
    });

    // Build agent / team workload distribution
    const teamGroups = new Map<string, Ticket[]>();
    for (const t of inWindowTickets) {
      const list = teamGroups.get(t.team) ?? [];
      list.push(t);
      teamGroups.set(t.team, list);
    }

    const teamWorkload: TeamWorkloadPoint[] = Array.from(teamGroups.entries())
      .map(([teamKey, list]) => {
        const resolved = list.filter((t) => t.status === "resolved" || t.status === "closed").length;
        const escalated = list.filter((t) => t.status === "escalated").length;
        const open = list.filter((t) => t.status === "open").length;
        const highPriority = list.filter((t) => t.priority === "P1" || t.priority === "P2").length;
        const avgResolutionMin =
          Math.round(
            (list.reduce((sum, t) => sum + estimateResolutionMinutes(t), 0) / list.length) * 10
          ) / 10;

        return {
          teamKey,
          teamLabel: TEAM_LABELS[teamKey] ?? teamKey.replace(/_/g, " "),
          resolved,
          escalated,
          open,
          total: list.length,
          highPriority,
          avgResolutionMin,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Summary stats
    const allMins = inWindowTickets.map(estimateResolutionMinutes).sort((a, b) => a - b);
    const medianMin =
      allMins.length === 0 ? 0 : allMins[Math.floor((allMins.length - 1) * 0.5)];
    const aiAllMins = inWindowTickets.filter(isAiResolved).map(estimateResolutionMinutes);
    const aiAvgMin =
      aiAllMins.length === 0
        ? 0
        : Math.round((aiAllMins.reduce((a, b) => a + b, 0) / aiAllMins.length) * 10) / 10;

    const topTeam = teamWorkload[0] ?? null;

    return {
      windowLabel: `${formatShortDate(windowStart)} – ${formatShortDate(anchor)}`,
      totalCount: inWindowTickets.length,
      medianMin,
      aiAvgMin,
      topTeam,
      dailySeries,
      teamWorkload,
    };
  }, [tickets, scope]);

  return (
    <div className="space-y-6">
      {/* Scope & Window Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
            <h2 className="font-display font-bold text-base text-slate-900">
              30-Day Resolution &amp; Agent Workload Dashboard
            </h2>
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span>
              Window: <span className="font-mono">{analytics.windowLabel}</span> · Live tickets
              from <span className="font-mono">tickets.json</span>{" "}
              {scope === "combined"
                ? "merged with 29-day simulated campus baseline"
                : "only (no simulated history)"}
            </span>
          </p>
        </div>

        <div
          role="group"
          aria-label="Analytics data scope"
          className="inline-flex items-center p-1 bg-slate-100 rounded-xl text-xs self-start"
        >
          <button
            type="button"
            aria-pressed={scope === "combined"}
            onClick={() => setScope("combined")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
              scope === "combined"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Live + 30-Day History
          </button>
          <button
            type="button"
            aria-pressed={scope === "live"}
            onClick={() => setScope("live")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
              scope === "live"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Live Queue Only ({tickets.length})
          </button>
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">30-Day Ticket Volume</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-slate-900 mt-1">
            {analytics.totalCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">Across {analytics.teamWorkload.length} specialist teams</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Median Resolution Time</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-[#0055A2] mt-1">
            {analytics.medianMin.toFixed(1)} min
          </div>
          <div className="text-xs text-slate-500 mt-1">Combined AI + specialist handoff</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">AI Auto-Resolve Avg</div>
          <div className="font-mono tabular-nums font-bold text-2xl text-emerald-700 mt-1">
            {analytics.aiAvgMin.toFixed(1)} min
          </div>
          <div className="text-xs text-slate-500 mt-1">Self-service RAG + MCP workflows</div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Highest Workload Team</div>
          <div className="font-display font-bold text-xl text-slate-900 mt-1 truncate">
            {analytics.topTeam ? analytics.topTeam.teamLabel : "—"}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 mt-1">
            {analytics.topTeam
              ? `${analytics.topTeam.total} tickets (${Math.round(
                  (analytics.topTeam.total / Math.max(1, analytics.totalCount)) * 100
                )}% share)`
              : "No active tickets"}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Ticket Resolution Times Over Last 30 Days */}
        <section
          aria-label="Ticket Resolution Times Last 30 Days"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
                <span>Ticket Resolution Times (Last 30 Days)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily average minutes to resolution: overall vs. AI auto-resolved vs. human team
              </p>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={analytics.dailySeries}
                margin={{ top: 10, right: 12, left: -8, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="avgResFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0055A2" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#0055A2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickLine={false}
                  axisLine={{ stroke: "#CBD5E1" }}
                  minTickGap={22}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickLine={false}
                  axisLine={false}
                  unit="m"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E2E8F0",
                    borderRadius: "12px",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgb(15 23 42 / 0.08)",
                  }}
                  formatter={(value: unknown, name: unknown) => {
                    if (value === null || value === undefined) return ["—", String(name)];
                    return [`${Number(value).toFixed(1)} min`, String(name)];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                <Area
                  type="monotone"
                  dataKey="avgResolutionMin"
                  name="Overall Avg (min)"
                  stroke="#0055A2"
                  strokeWidth={2}
                  fill="url(#avgResFill)"
                />
                <Line
                  type="monotone"
                  dataKey="humanAvgMin"
                  name="Human Specialist Avg (min)"
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#D97706" }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="aiAvgMin"
                  name="AI Auto-Resolve Avg (min)"
                  stroke="#047857"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#047857" }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Chart 2: Agent / Team Workload Distribution */}
        <section
          aria-label="Agent Workload Distribution Last 30 Days"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
        >
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
              <span>Agent Workload Distribution (Last 30 Days)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tickets handled by each specialist team, stacked by resolution outcome
            </p>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.teamWorkload}
                layout="vertical"
                margin={{ top: 6, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickLine={false}
                  axisLine={{ stroke: "#CBD5E1" }}
                />
                <YAxis
                  type="category"
                  dataKey="teamLabel"
                  width={118}
                  tick={{ fontSize: 11, fill: "#334155" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E2E8F0",
                    borderRadius: "12px",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgb(15 23 42 / 0.08)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                <Bar
                  dataKey="resolved"
                  name="Resolved / Closed"
                  stackId="workload"
                  fill="#047857"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="escalated"
                  name="Escalated"
                  stackId="workload"
                  fill="#D97706"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="open"
                  name="Open"
                  stackId="workload"
                  fill="#0055A2"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Team SLA & Workload Breakdown Table */}
      <section
        aria-label="Team Resolution and Workload Breakdown"
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <h3 className="font-display font-bold text-sm text-slate-900">
            Team Workload &amp; Resolution Breakdown
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {analytics.teamWorkload.length} teams active
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2.5 px-5">Specialist Team / Agent Group</th>
                <th className="py-2.5 px-4 text-right">Total Tickets</th>
                <th className="py-2.5 px-4 text-right">Resolved / Closed</th>
                <th className="py-2.5 px-4 text-right">Escalated</th>
                <th className="py-2.5 px-4 text-right">High Priority (P1–P2)</th>
                <th className="py-2.5 px-5 text-right">Avg Resolution Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.teamWorkload.map((row) => (
                <tr key={row.teamKey} className="hover:bg-slate-50/70">
                  <td className="py-3 px-5 font-semibold text-slate-900">{row.teamLabel}</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-900">
                    {row.total}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-emerald-700">
                    {row.resolved}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-amber-700">
                    {row.escalated}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-red-700">
                    {row.highPriority}
                  </td>
                  <td className="py-3 px-5 font-mono tabular-nums text-right text-slate-700">
                    {row.avgResolutionMin.toFixed(1)} min
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
