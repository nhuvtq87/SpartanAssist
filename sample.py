"""
SpartanAssist: multi-agent IT support workflow with state management (Team Auto-Mates).

A compact, runnable version of the capstone notebook:
  Privacy Guard -> Intake -> Knowledge -> Workflow -> Escalation -> Responder
built as a LangGraph StateGraph with conditional edges.

Runs offline by default (rule-based intake + TF-IDF retrieval), so it needs no API key.
Uses helpdesk_tools.py (the same functions the MCP server exposes) and the
06_Knowledge_Base/*.md runbooks.

    pip install langgraph scikit-learn
    python sample.py
"""
from __future__ import annotations

import glob
import os
import re
from typing import List, Optional, TypedDict

from langgraph.graph import END, StateGraph
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import helpdesk_tools as tools

HERE = os.path.dirname(os.path.abspath(__file__))
KB_DIRS = [os.path.join(HERE, "06_Knowledge_Base"), os.path.join(HERE, "..", "06_Knowledge_Base"), os.path.join(HERE, "kb")]
SIMILARITY_FLOOR = 0.12          # below this, the KB "doesn't say it" and we don't answer
CONFIDENCE_FLOOR = 0.55          # below this, a person takes over


# ---------------------------------------------------------------- state
class HelpdeskState(TypedDict, total=False):
    user: str
    raw_message: str
    message: str                 # redacted
    redactions: List[str]
    category: str                # network, account, software, printing, email, lms, hardware, security, other
    priority: str                # P1-P4
    confidence: float
    action: Optional[str]        # which automation Workflow should run
    wants_human: bool
    security_flags: List[str]
    kb_hits: List[dict]          # [{"id", "title", "text", "score"}]
    grounded: bool
    tool_results: List[dict]
    ticket: dict
    escalated: bool
    escalation_reason: List[str]
    handoff: dict
    reply: str
    path: List[str]              # nodes visited, for the audit trail


# ---------------------------------------------------------------- knowledge base (24 section chunks)
def load_kb() -> List[dict]:
    kb_dir = next((d for d in KB_DIRS if os.path.isdir(d)), None)
    if not kb_dir:
        raise SystemExit("Knowledge base folder not found. Put the KB-*.md files in ./06_Knowledge_Base")
    chunks = []
    for path in sorted(glob.glob(os.path.join(kb_dir, "KB-*.md"))):
        kb_id = os.path.basename(path)[:-3]
        text = open(path, encoding="utf-8").read()
        cat = re.search(r"_category:\s*(\w+)", text)
        for sec in re.split(r"\n## ", text)[1:]:
            title, _, body = sec.partition("\n")
            chunks.append({"id": kb_id, "title": title.strip(), "text": body.strip(),
                           "category": cat.group(1) if cat else "other"})
    return chunks


KB = load_kb()
_VEC = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
_MATRIX = _VEC.fit_transform([f"{c['title']} {c['title']} {c['text']}" for c in KB])


def retrieve(query: str, category: str, k: int = 2) -> List[dict]:
    scores = cosine_similarity(_VEC.transform([query]), _MATRIX)[0]
    ranked = []
    for i, s in enumerate(scores):
        boost = 0.05 if KB[i]["category"] == category else 0.0
        ranked.append((s + boost, i))
    ranked.sort(reverse=True)
    return [{**KB[i], "score": round(float(s), 3)} for s, i in ranked[:k] if s >= SIMILARITY_FLOOR]


# ---------------------------------------------------------------- 1. Privacy Guard
PII = [
    ("password", re.compile(r"(?i)(password|passcode|pwd)\s*(is|:|=)\s*\S+")),
    ("student_id", re.compile(r"\b0\d{8}\b|\b\d{9}\b")),
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")),
    ("phone", re.compile(r"\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")),
]


def privacy_guard(state: HelpdeskState) -> HelpdeskState:
    msg, found = state["raw_message"], []
    for label, rx in PII:
        if rx.search(msg):
            found.append(label)
            msg = rx.sub(f"[{label.upper()} HIDDEN]", msg)
    return {"message": msg, "redactions": found, "path": ["privacy_guard"]}


# ---------------------------------------------------------------- 2. Intake (offline rules; Gemini structured output in the notebook)
SECURITY_PATTERNS = {
    "credential entered on a suspicious page": r"(typed|entered|put) my (password|login).{0,40}(weird|fake|strange|suspicious|link|page|site)",
    "user disowns account activity": r"(wasn'?t me|never sent|didn'?t send|not me\b).{0,60}(email|login|sign|account|message)|(email|message)s?.{0,40}(never sent|didn'?t send)",
    "phishing report": r"\b(phish|scam|suspicious email|hacked|compromised)\b",
    "unexpected MFA push": r"(duo|mfa|push).{0,30}(didn'?t|not me|unexpected|approved by accident)",
}
RULES = [  # (category, keywords, priority, action)
    ("network", r"wi-?fi|eduroam|internet|vpn|disconnect", "P3", "run_network_diagnostics"),
    ("account", r"disabled", "P1", None),
    ("account", r"locked out|lock(ed)? me out|keep getting locked|unlock", "P2", "unlock_account"),
    ("account", r"password|reset|forgot", "P2", "send_password_reset"),
    ("software", r"install|license|office|adobe|spss|software", "P4", "check_license"),
    ("printing", r"print", "P4", None),
    ("email", r"outlook|gmail|email|inbox", "P3", None),
    ("lms", r"canvas|course site|assignment upload", "P3", "check_service_status"),
    ("hardware", r"screen|keyboard|cracked|broken|laptop won'?t", "P3", None),
]
URGENT = r"exam|final|in \d+ ?min|due (tonight|today)|right now|urgent"


def intake(state: HelpdeskState) -> HelpdeskState:
    q = state["message"].lower()
    flags = [name for name, rx in SECURITY_PATTERNS.items() if re.search(rx, q)]
    wants_human = bool(re.search(r"real person|human|talk to (a|someone)|agent please", q))
    category, priority, action, conf = "other", "P4", None, 0.6
    for cat, kw, pri, act in RULES:
        if re.search(kw, q):
            category, priority, action, conf = cat, pri, act, 0.85
            break
    if category == "other":
        conf = 0.9 if not re.search(r"computer|\bit\b|account|login|laptop", q) else 0.4
    if re.search(URGENT, q) and priority in ("P3", "P4", "P2"):
        priority = "P1" if "disabled" in q or re.search(r"exam|final", q) and category == "account" else "P2"
    if flags:                                            # security overrides everything
        category, priority, action, conf = "security", "P1", None, 0.95
    return {"category": category, "priority": priority, "action": action, "confidence": conf,
            "wants_human": wants_human, "security_flags": flags, "path": state["path"] + ["intake"]}


# ---------------------------------------------------------------- 3. Knowledge (RAG + citation check)
def knowledge(state: HelpdeskState) -> HelpdeskState:
    hits = retrieve(state["message"], state["category"])
    return {"kb_hits": hits, "grounded": bool(hits), "path": state["path"] + ["knowledge"]}


# ---------------------------------------------------------------- 4. Workflow (the only node that touches tools; least privilege)
def workflow(state: HelpdeskState) -> HelpdeskState:
    user, results = state["user"], []
    act = state.get("action")
    if act == "unlock_account":
        log = tools.analyze_auth_log(user)                 # look before you unlock
        results.append(log)
        if log.get("pattern") == "credential_attack":
            return {"tool_results": results, "category": "security", "priority": "P1",
                    "security_flags": state["security_flags"] + ["credential attack in sign-in log"],
                    "path": state["path"] + ["workflow"]}
        results.append(tools.unlock_account(user))
    elif act == "send_password_reset":
        results.append(tools.send_password_reset(user))
    elif act == "run_network_diagnostics":
        results.append(tools.run_network_diagnostics(user, building="library"))
    elif act == "check_license":
        product = next((p for p in ("Adobe", "SPSS", "Office", "Tableau") if p.lower() in state["message"].lower()), "Microsoft 365")
        results.append(tools.check_license(user, product))
    elif act == "check_service_status":
        results.append(tools.check_service_status())
    ticket = tools.create_ticket(user, state["category"], state["priority"], state["message"][:120], status="open")
    return {"tool_results": results, "ticket": ticket, "path": state["path"] + ["workflow"]}


# ---------------------------------------------------------------- 5. Escalation (rules decide; written policy KB-POL-01)
TEAMS = {"network": "Networking", "account": "Accounts", "security": "Security Ops", "software": "Software Licensing",
         "printing": "Desktop Support", "email": "Collaboration", "lms": "Academic Tech", "hardware": "Desktop Support"}


def escalation_reasons(state: HelpdeskState) -> List[str]:
    r = []
    if state["priority"] == "P1": r.append("P1 priority")
    if state.get("security_flags"): r.append("security: " + ", ".join(state["security_flags"]))
    if state.get("confidence", 1) < CONFIDENCE_FLOOR: r.append("low intake confidence")
    if state["category"] != "other" and not state.get("grounded"): r.append("no grounded KB answer")
    if any(not t.get("success", True) for t in state.get("tool_results", [])): r.append("automation failed")
    if state["category"] == "hardware": r.append("physical repair")
    if state.get("wants_human"): r.append("user asked for a person")
    return r


def escalation(state: HelpdeskState) -> HelpdeskState:
    reasons = escalation_reasons(state)
    team = TEAMS.get(state["category"], "Service Desk")
    channel = "24/7 phone line" if state["priority"] == "P1" else "ticket portal"
    ticket = state.get("ticket") or tools.create_ticket(state["user"], state["category"], state["priority"],
                                                        state["message"][:120], status="escalated")
    tools.update_ticket(ticket["ticket_id"], "escalated", "; ".join(reasons))
    handoff = {"team": team, "channel": channel, "sla": tools.SLA[state["priority"]], "reasons": reasons,
               "note": f"Redacted request: {state['message']} | tried: {[t.get('action') for t in state.get('tool_results', [])]}"}
    return {"escalated": True, "escalation_reason": reasons, "handoff": handoff,
            "ticket": {**ticket, "status": "escalated"}, "path": state["path"] + ["escalation"]}


# ---------------------------------------------------------------- 6. Responder (one clear reply)
def responder(state: HelpdeskState) -> HelpdeskState:
    parts = []
    if state.get("redactions"):
        parts.append(f"(I hid your {', '.join(state['redactions'])}. Please don't share those here.)")
    if state["category"] == "other" and not state.get("escalated"):
        parts.append("That's outside what campus IT can help with. Ask me about Wi-Fi, accounts, software, printing or email.")
    else:
        if state.get("kb_hits"):
            top = state["kb_hits"][0]
            parts.append(f"Here's what to do ({top['title']}):\n{top['text']}\nSource: [{top['id']}]")
        for t in state.get("tool_results", []):
            if t.get("message"):
                parts.append(f"Done for you: {t['message']}")
        if state.get("escalated"):
            h = state["handoff"]
            parts.append(f"A person is taking over: {h['team']} via {h['channel']} (target response {h['sla']}).")
        if state.get("ticket"):
            parts.append(f"Ticket {state['ticket']['ticket_id']} · {state['ticket'].get('status', 'open')}")
    return {"reply": "\n".join(parts), "path": state["path"] + ["responder"]}


# ---------------------------------------------------------------- routing (conditional edges)
def after_intake(state: HelpdeskState) -> str:
    return "responder" if state["category"] == "other" and state["confidence"] >= CONFIDENCE_FLOOR else "knowledge"


def after_knowledge(state: HelpdeskState) -> str:
    if state["priority"] == "P1" or state.get("security_flags") or state.get("wants_human") \
            or not state.get("grounded") or state["category"] == "hardware":
        return "escalation"
    return "workflow" if state.get("action") else "responder"


def after_workflow(state: HelpdeskState) -> str:
    return "escalation" if escalation_reasons(state) else "responder"


def build_graph():
    g = StateGraph(HelpdeskState)
    for name, fn in [("privacy_guard", privacy_guard), ("intake", intake), ("knowledge", knowledge),
                     ("workflow", workflow), ("escalation", escalation), ("responder", responder)]:
        g.add_node(name, fn)
    g.set_entry_point("privacy_guard")
    g.add_edge("privacy_guard", "intake")
    g.add_conditional_edges("intake", after_intake, {"knowledge": "knowledge", "responder": "responder"})
    g.add_conditional_edges("knowledge", after_knowledge,
                            {"workflow": "workflow", "escalation": "escalation", "responder": "responder"})
    g.add_conditional_edges("workflow", after_workflow, {"escalation": "escalation", "responder": "responder"})
    g.add_edge("escalation", "responder")
    g.add_edge("responder", END)
    return g.compile()


APP = build_graph()


def handle(user: str, message: str) -> HelpdeskState:
    return APP.invoke({"user": user, "raw_message": message, "path": []})


if __name__ == "__main__":
    demos = [
        ("student_001", "The wifi in the library keeps disconnecting every few minutes on my laptop"),
        ("student_002", "I'm locked out and my essay is due tonight"),
        ("student_003_disabled", "My account says DISABLED and my final starts in 20 min, ID 012345678"),
        ("student_004", "I typed my password on a weird page from an email link, my password is Spartan2026!"),
        ("student_005", "How do I print in the library and how much does color cost?"),
        ("student_006", "What's the best pizza near campus?"),
        ("student_107", "I keep getting locked out, can you unlock it?"),
        ("student_008", "My friends got emails from me that I never sent"),
    ]
    for user, msg in demos:
        s = handle(user, msg)
        print("=" * 90)
        print(f"Student: {msg}")
        print(f"Path:    {' -> '.join(s['path'])}")
        print(f"Result:  {s['category']} · {s['priority']} · {'escalated' if s.get('escalated') else 'resolved'}")
        print(s["reply"])
