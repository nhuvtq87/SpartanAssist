# SpartanAssist — Multi-Agent AI IT Help Desk
**BUS4 118S SPECIAL TOPICS MIS · Capstone · Team Auto-Mates · San José State University**

Sri Sudula (Project Manager / Coordinator) · Nhu Vo (Tech Lead) · Liz Pham (Developer) ·  Kimberly Gomez (Business Lead) · Yuvraj Singh (Presentation Lead) · Jorge Perez (QA & Testing Lead)

SpartanAssist is a LangGraph system for campus IT tickets. A Privacy Guard runs first, then the Intake, Knowledge (RAG), Workflow and Escalation agents, then a Responder. Workflow automations run through a real MCP server, and VS Code + GitHub Copilot connects to the same server.

## What's in this package (mapped to the capstone steps)

| Capstone step | Where |
|---|---|
| 1. Define the use case (product owner, success metrics) | `01_Report` §Use case and success metrics |
| 2. Identify the agents (Intake, Knowledge, Workflow, Escalation) | `01_Report` §Agent design · notebook sections 6–11 |
| 3. UX design (wireframes / mockups) | `03_UX_Wireframes` (4 screens) · `01_Report` §UX design |
| 4. System development (LangGraph) | `04_Notebook_and_Code/SpartanAssist_AutoMates_Capstone.ipynb` |
| 5. Testing & validation (accuracy, response time, satisfaction) | `05_Testing_and_Validation` · notebook section 13 |
| 6. Presentation (demo, design decisions, lessons learned) | `02_Presentation/SpartanAssist_Demo_Deck.pdf` |
| RAG integration (embeddings + vector store, best practices) | notebook sections 3–4 and 8 · `06_Knowledge_Base` |
| Workflow automation | notebook sections 5 and 9 · `helpdesk_tools.py` |
| MCP integration (VS Code ↔ GitHub / Jira) | `helpdesk_mcp_server.py`, `.vscode/mcp.json`, `MCP_VS_Code_Setup.md`, notebook section 14 |
| Multi-agent collaboration | notebook section 11 (conditional LangGraph edges) |
| Industry awareness (Glean, ServiceNow/Moveworks, Atlassian) | `01_Report` §Industry landscape |

## Run it
1. Open the notebook in Google Colab.
2. *(Optional)* Add `GOOGLE_API_KEY` in Colab Secrets for Gemini mode. Without a key it runs in **offline mode** (local TF-IDF embeddings + rule-based agents), so it always works.
3. Runtime → Run all. Section 12 runs the 6 demos, section 13 runs the 30 tests, section 14 runs the MCP client demo.
4. For the VS Code part, open `04_Notebook_and_Code/` in VS Code and follow `MCP_VS_Code_Setup.md`.

## Key results (offline mode, Nov 12, 2026)
| | Main set (20) | Held-out (10) |
|---|---|---|
| Category accuracy | 100% | 90% |
| Routing accuracy | 100% | 90% |
| Retrieval hit@2 / grounded answers | 100% / 100% | n/a |
| Auto-resolved / escalated / out of scope | 70% / 25% / 5% | n/a |

Known failure: held-out case H09, an account takeover classified as a login issue. Details and the fix are in `05_Testing_and_Validation/Test_Plan_and_Results.md`.

> The knowledge base is **simulated**, modeled on typical university IT services. It is not official SJSU IT guidance.
