export type Category =
  | "network"
  | "authentication"
  | "software"
  | "hardware"
  | "email"
  | "printing"
  | "learning_platform"
  | "security"
  | "other";

export type Severity = "P1" | "P2" | "P3" | "P4";

export type WorkflowName =
  | "send_password_reset"
  | "unlock_account"
  | "run_network_diagnostics"
  | "check_service_status"
  | "check_license"
  | "none";

export type ResolutionStatus = "resolved" | "escalated" | "out_of_scope";

export type RunMode = "gemini" | "offline";

export interface KBArticle {
  id: string;
  category: Exclude<Category, "other"> | "policy";
  title: string;
  body: string;
}

export interface KBChunk {
  chunk_id: string;
  doc_id: string;
  category: string;
  title: string;
  section: string;
  text: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  doc_id: string;
  category: string;
  title: string;
  section: string;
  text: string;
  similarity: number;
  score: number;
}

export interface WorkflowResult {
  success: boolean;
  action: string;
  message?: string;
  expires_in_minutes?: number;
  results?: Record<string, string>;
  services?: Record<string, string>;
  checked?: string;
  product?: string;
  entitled?: boolean;
}

export interface EscalationInfo {
  reasons: string[];
  team: string;
  channel: string;
  sla: string;
  handoff: string;
}

export interface HelpDeskState {
  user_id: string;
  raw_query: string;
  query: string;
  pii_found: string[];
  category: Category;
  severity: Severity;
  confidence: number;
  intent: string;
  workflow: WorkflowName;
  wants_human: boolean;
  retrieved: RetrievedChunk[];
  grounded: boolean;
  answer: string;
  steps: string[];
  citations: string[];
  workflow_result?: WorkflowResult;
  ticket_id?: string;
  escalated: boolean;
  escalation?: EscalationInfo;
  status: ResolutionStatus;
  final_response: string;
  trace: string[];
  timings: Record<string, number>;
  latency_ms: number;
  mode_used: RunMode;
  fallback_reason?: string;
}

export interface Ticket {
  id: string;
  created: string;
  resolved_at?: string;
  resolution_minutes?: number;
  user: string;
  category: string;
  priority: Severity;
  summary: string;
  status: "open" | "resolved" | "escalated" | "closed";
  team: string;
  notes: string;
  sla: string;
  csat?: number;
  trace?: string[];
  escalation_reasons?: string[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        default?: string | number;
      }
    >;
    required: string[];
  };
}

export interface ValidationRow {
  id: string;
  suite: "main" | "heldout";
  query: string;
  exp_category: Category;
  category: Category;
  exp_severity?: Severity;
  severity: Severity;
  exp_status: ResolutionStatus;
  status: ResolutionStatus;
  exp_doc?: string | null;
  retrieved: string[];
  workflow: WorkflowName;
  confidence: number;
  latency_ms: number;
  path: string;
  cat_ok: boolean;
  sev_ok?: boolean;
  sev_within1?: boolean;
  route_ok: boolean;
  hit_at_2?: boolean;
  grounded_ok?: boolean;
  security_false_negative: boolean;
  csat_proxy: number;
}

export interface ValidationMetrics {
  mode: RunMode;
  scenarios_main: number;
  scenarios_heldout: number;
  category_accuracy: number;
  severity_exact_accuracy: number;
  severity_within1_accuracy: number;
  routing_accuracy: number;
  retrieval_hit_at_2: number;
  grounded_answers: number;
  auto_resolved_rate: number;
  escalated_rate: number;
  out_of_scope_rate: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  csat_proxy: number;
  heldout_category_accuracy: number;
  heldout_routing_accuracy: number;
  security_false_negatives: number;
}
