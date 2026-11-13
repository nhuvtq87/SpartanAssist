import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { MCPToolDefinition, Severity, Ticket, WorkflowResult } from "../src/types.ts";

export const SLA_BY_PRIORITY: Record<string, string> = {
  P1: "15 minutes",
  P2: "4 hours",
  P3: "1 business day",
  P4: "3 business days",
};

export const TEAM_BY_CATEGORY: Record<string, string> = {
  network: "networking",
  authentication: "accounts",
  security: "security_ops",
  hardware: "desktop_support",
  software: "software_licensing",
  email: "collaboration",
  printing: "desktop_support",
  learning_platform: "academic_tech",
  other: "service_desk",
};

const DATA_DIR = path.resolve(process.cwd(), ".spartanassist_data");
const TICKETS_FILE = path.join(DATA_DIR, "tickets.json");

function ensureStore(): Ticket[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TICKETS_FILE)) {
    const seed: Ticket[] = [
      {
        id: "INC-261112-B28BD",
        created: "2026-11-12T11:25:10",
        user: "student_103",
        category: "authentication",
        priority: "P1",
        summary: "My account says DISABLED and my online final exam starts in 20 minutes! My ID is [STUDENT_ID]",
        status: "escalated",
        team: "accounts",
        notes: "P1 authentication case for student_103. Escalated because: P1 severity. Administrative hold requires Accounts team review.",
        sla: "15 minutes",
        trace: ["privacy_guard", "intake", "knowledge", "escalation", "responder"],
        escalation_reasons: ["P1 severity"],
      },
      {
        id: "INC-261112-D419F",
        created: "2026-11-12T11:21:42",
        user: "student_104",
        category: "security",
        priority: "P1",
        summary: "I clicked a link in an email and typed my password on a weird login page. My password [REDACTED]",
        status: "escalated",
        team: "security_ops",
        notes: "P1 security case for student_104. Possible account compromise; escalated to Security Ops via 24/7 phone line.",
        sla: "15 minutes",
        trace: ["privacy_guard", "intake", "knowledge", "escalation", "responder"],
        escalation_reasons: ["P1 severity", "possible security incident"],
      },
      {
        id: "INC-261112-C2164",
        created: "2026-11-12T11:18:05",
        user: "student_102",
        category: "authentication",
        priority: "P2",
        summary: "I'm locked out of my account after too many tries and my essay is due tonight",
        status: "resolved",
        team: "accounts",
        notes: "auto-resolved by SpartanAssist (unlock_account)",
        sla: "4 hours",
        csat: 5,
        trace: ["privacy_guard", "intake", "knowledge", "workflow", "responder"],
      },
      {
        id: "INC-261112-249B2",
        created: "2026-11-12T11:14:29",
        user: "student_101",
        category: "network",
        priority: "P3",
        summary: "The wifi in the library keeps disconnecting every few minutes on my laptop",
        status: "resolved",
        team: "networking",
        notes: "auto-resolved by SpartanAssist (run_network_diagnostics)",
        sla: "1 business day",
        csat: 5,
        trace: ["privacy_guard", "intake", "knowledge", "workflow", "responder"],
      },
    ];
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
  try {
    const raw = fs.readFileSync(TICKETS_FILE, "utf8");
    return JSON.parse(raw) as Ticket[];
  } catch {
    return [];
  }
}

function saveTickets(tickets: Ticket[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2), "utf8");
}

function formatDateStamp(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function createTicket(params: {
  user: string;
  category: string;
  priority: Severity;
  summary: string;
  status?: Ticket["status"];
  team?: string;
  notes?: string;
  trace?: string[];
  escalation_reasons?: string[];
}): { success: true; ticket_id: string; status: Ticket["status"]; team: string; sla: string } {
  const tickets = ensureStore();
  const hash = crypto
    .createHash("md5")
    .update(`${params.user}${params.summary}${Date.now()}${Math.random()}`)
    .digest("hex")
    .slice(0, 5)
    .toUpperCase();
  const tid = `INC-${formatDateStamp()}-${hash}`;
  const status = params.status ?? "open";
  const team = params.team ?? TEAM_BY_CATEGORY[params.category] ?? "service_desk";
  const sla = SLA_BY_PRIORITY[params.priority] ?? "3 business days";

  const ticket: Ticket = {
    id: tid,
    created: new Date().toISOString().slice(0, 19),
    user: params.user,
    category: params.category,
    priority: params.priority,
    summary: params.summary,
    status,
    team,
    notes: params.notes ?? "",
    sla,
    trace: params.trace,
    escalation_reasons: params.escalation_reasons,
  };

  tickets.unshift(ticket);
  saveTickets(tickets);
  return { success: true, ticket_id: tid, status, team, sla };
}

export function updateTicket(
  ticketId: string,
  status: Ticket["status"],
  notes?: string,
  csat?: number
): { success: boolean; ticket_id: string; status: Ticket["status"]; ticket?: Ticket } {
  const tickets = ensureStore();
  const target = tickets.find((t) => t.id === ticketId);
  if (!target) {
    return { success: false, ticket_id: ticketId, status };
  }
  target.status = status;
  if ((status === "resolved" || status === "closed") && !target.resolved_at) {
    const now = new Date();
    target.resolved_at = now.toISOString().slice(0, 19);
    const createdMs = Date.parse(target.created);
    if (!Number.isNaN(createdMs)) {
      const diffMins = Math.max(0.1, Math.round(((now.getTime() - createdMs) / 60000) * 10) / 10);
      target.resolution_minutes = diffMins;
    }
  }
  if (notes !== undefined && notes !== "") {
    target.notes = notes;
  }
  if (csat !== undefined) {
    target.csat = csat;
  }
  if (status === "escalated" && (!target.escalation_reasons || target.escalation_reasons.length === 0)) {
    target.escalation_reasons = ["user requested a person"];
  }
  saveTickets(tickets);
  return { success: true, ticket_id: ticketId, status, ticket: target };
}

export function listTickets(filters?: {
  status?: string;
  priority?: string;
  limit?: number;
}): Ticket[] {
  const tickets = ensureStore();
  const limit = filters?.limit ?? 50;
  return tickets
    .filter((t) => (!filters?.status || t.status === filters.status))
    .filter((t) => (!filters?.priority || t.priority === filters.priority))
    .slice(0, limit);
}

export function sendPasswordReset(user: string): WorkflowResult {
  return {
    success: true,
    action: "password_reset_link_sent",
    expires_in_minutes: 30,
    message: "A reset link was sent to your registered recovery email. It expires in 30 minutes.",
  };
}

export function unlockAccount(user: string): WorkflowResult {
  if (user.endsWith("_disabled")) {
    return {
      success: false,
      action: "unlock_account",
      message: "Account is disabled (administrative hold), not locked.",
    };
  }
  return {
    success: true,
    action: "account_unlocked",
    message: "Your account is unlocked. You can sign in now.",
  };
}

function deterministicHashInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function runNetworkDiagnostics(user: string, building = "unknown"): WorkflowResult {
  const h = deterministicHashInt(`${user}${building}`);
  const apOk = (h % 100) >= 20;
  const signal = 58 + (h % 33);
  return {
    success: true,
    action: "network_diagnostics",
    results: {
      dhcp_lease: "OK",
      dns: "OK",
      gateway: "OK",
      access_point: apOk ? "OK" : "DEGRADED (high client load)",
      signal_strength: `${signal}%`,
    },
    message: apOk
      ? "DHCP, DNS, gateway and the nearby access point look healthy, so the issue is likely on your laptop."
      : "Nearby access point is degraded; Networking has been notified.",
  };
}

export function checkServiceStatus(_service = "all"): WorkflowResult {
  return {
    success: true,
    action: "service_status",
    services: {
      "eduroam Wi-Fi": "operational",
      VPN: "operational",
      Canvas: "operational",
      Email: "operational",
      Printing: "operational",
      "Okta/Duo sign-in": "operational",
    },
    checked: new Date().toISOString().slice(0, 19),
  };
}

export function checkLicense(_user: string, product: string): WorkflowResult {
  const entitled = new Set([
    "microsoft 365",
    "office",
    "adobe",
    "adobe creative cloud",
    "spss",
    "tableau",
  ]).has(product.toLowerCase());
  return {
    success: true,
    action: "license_check",
    product,
    entitled,
    message: entitled
      ? `You are licensed for ${product}.`
      : `No license found for ${product}; request it in the software portal.`,
  };
}

export const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: "create_ticket",
    description: "Create an IT support ticket. priority is P1-P4.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User identifier", default: "staff_demo" },
        category: { type: "string", description: "IT category (network, authentication, etc.)", default: "network" },
        priority: { type: "string", description: "Priority level P1-P4", default: "P3" },
        summary: { type: "string", description: "Short summary of the issue" },
      },
      required: ["user", "category", "priority", "summary"],
    },
  },
  {
    name: "update_ticket",
    description: "Change a ticket's status (open, resolved, escalated, closed).",
    inputSchema: {
      type: "object",
      properties: {
        ticket_id: { type: "string", description: "Ticket ID e.g. INC-261112-B28BD" },
        status: { type: "string", description: "New status: open, resolved, escalated, or closed", default: "resolved" },
        notes: { type: "string", description: "Optional technician notes", default: "" },
      },
      required: ["ticket_id", "status"],
    },
  },
  {
    name: "list_tickets",
    description: "List recent tickets, optionally filtered by status (open/resolved/escalated) and priority (P1-P4).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status (empty for all)", default: "" },
        priority: { type: "string", description: "Filter by priority P1-P4 (empty for all)", default: "" },
        limit: { type: "number", description: "Max tickets to return", default: 20 },
      },
      required: [],
    },
  },
  {
    name: "send_password_reset",
    description: "Send a password reset link to the user's recovery email.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User identifier", default: "student_001" },
      },
      required: ["user"],
    },
  },
  {
    name: "unlock_account",
    description: "Unlock a locked account (does not work for disabled accounts).",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User identifier", default: "student_001" },
      },
      required: ["user"],
    },
  },
  {
    name: "run_network_diagnostics",
    description: "Run DHCP/DNS/gateway/access-point checks for a user's location.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User identifier", default: "student_001" },
        building: { type: "string", description: "Campus building name", default: "Library" },
      },
      required: ["user"],
    },
  },
  {
    name: "check_service_status",
    description: "Get current status of campus IT services.",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name or 'all'", default: "all" },
      },
      required: [],
    },
  },
  {
    name: "check_license",
    description: "Check whether the user is entitled to a campus software license.",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User identifier", default: "student_001" },
        product: { type: "string", description: "Software title (e.g. Adobe Creative Cloud, Microsoft 365)", default: "Adobe Creative Cloud" },
      },
      required: ["user", "product"],
    },
  },
];

export function callMcpTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "create_ticket":
      return createTicket({
        user: String(args.user ?? "staff_demo"),
        category: String(args.category ?? "network"),
        priority: (String(args.priority ?? "P3") as Severity) || "P3",
        summary: String(args.summary ?? "Created from MCP tool inspector"),
      });
    case "update_ticket":
      return updateTicket(
        String(args.ticket_id ?? ""),
        (String(args.status ?? "open") as Ticket["status"]) || "open",
        args.notes !== undefined ? String(args.notes) : undefined
      );
    case "list_tickets":
      return listTickets({
        status: args.status ? String(args.status) : undefined,
        priority: args.priority ? String(args.priority) : undefined,
        limit: args.limit !== undefined ? Number(args.limit) : 20,
      });
    case "send_password_reset":
      return sendPasswordReset(String(args.user ?? "student_001"));
    case "unlock_account":
      return unlockAccount(String(args.user ?? "student_001"));
    case "run_network_diagnostics":
      return runNetworkDiagnostics(
        String(args.user ?? "student_001"),
        String(args.building ?? "unknown")
      );
    case "check_service_status":
      return checkServiceStatus(String(args.service ?? "all"));
    case "check_license":
      return checkLicense(
        String(args.user ?? "student_001"),
        String(args.product ?? "Microsoft 365")
      );
    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}
