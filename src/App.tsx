import React, { useState, useEffect } from "react";
import {
  Activity,
  BookOpen,
  FlaskConical,
  GraduationCap,
  MessageSquare,
  Shield,
  Ticket as TicketIcon,
  User,
  UserCheck,
} from "lucide-react";
import HelpChatView from "./components/HelpChatView";
import StaffConsoleView from "./components/StaffConsoleView";
import KnowledgeBaseView from "./components/KnowledgeBaseView";
import ValidationLabView from "./components/ValidationLabView";
import type { KBArticle, KBChunk, RunMode } from "./types";

type PortalTab = "end_user" | "faculty";
type EndUserSubTab = "chat" | "guides";
type FacultySubTab = "tickets" | "trace" | "kb" | "validation";

export default function App() {
  const [portalTab, setPortalTab] = useState<PortalTab>("end_user");
  const [endUserTab, setEndUserTab] = useState<EndUserSubTab>("chat");
  const [facultyTab, setFacultyTab] = useState<FacultySubTab>("tickets");

  const [mode, setMode] = useState<RunMode>("offline");
  const [geminiAvailable, setGeminiAvailable] = useState<boolean>(false);
  const [services, setServices] = useState<Record<string, string>>({
    wifi_eduroam: "operational",
    vpn_globalprotect: "operational",
    canvas_lms: "operational",
    campus_email: "operational",
    printing_system: "operational",
  });
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [chunks, setChunks] = useState<KBChunk[]>([]);
  const [thresholds, setThresholds] = useState<Record<RunMode, number>>({
    gemini: 0.52,
    offline: 0.1,
  });
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [humanTrigger, setHumanTrigger] = useState<number>(0);
  const [staffRefresh, setStaffRefresh] = useState<number>(0);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [healthRes, kbRes] = await Promise.all([fetch("/api/health"), fetch("/api/kb")]);
        if (healthRes.ok) {
          const health = await healthRes.json();
          setGeminiAvailable(Boolean(health.geminiAvailable));
          setMode(health.defaultMode === "gemini" ? "gemini" : "offline");
          if (health.services) setServices(health.services);
        }
        if (kbRes.ok) {
          const kb = await kbRes.json();
          setArticles(kb.articles ?? []);
          setChunks(kb.chunks ?? []);
          if (kb.thresholds) setThresholds(kb.thresholds);
        }
      } catch {
        // Fallback defaults already populated
      }
    }
    bootstrap();
  }, []);

  const portalNavItems: Array<{
    id: PortalTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "end_user", label: "End User", icon: User },
    { id: "faculty", label: "Faculty", icon: GraduationCap },
  ];

  const endUserNavItems: Array<{
    id: EndUserSubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "chat", label: "IT Help Chat", icon: MessageSquare },
    { id: "guides", label: "Self-Service Guides", icon: BookOpen },
  ];

  const facultyNavItems: Array<{
    id: FacultySubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "tickets", label: "Ticket Queue & Analytics", icon: TicketIcon },
    { id: "trace", label: "Agent Trace & Demo", icon: Activity },
    { id: "kb", label: "RAG & KB Inspector", icon: BookOpen },
    { id: "validation", label: "Validation Lab", icon: FlaskConical },
  ];

  function selectPortal(tab: PortalTab) {
    setPortalTab(tab);
    if (tab === "faculty" && facultyTab === "tickets") {
      setStaffRefresh((n) => n + 1);
    }
  }

  function selectFacultySubTab(sub: FacultySubTab) {
    setFacultyTab(sub);
    if (sub === "tickets") {
      setStaffRefresh((n) => n + 1);
    }
  }

  function handleTalkToPersonCta() {
    setPortalTab("end_user");
    setEndUserTab("chat");
    setHumanTrigger((n) => n + 1);
  }

  function handleInspectKBArticle(docId: string, targetPortal: PortalTab) {
    setSelectedKbId(docId);
    if (targetPortal === "faculty") {
      setPortalTab("faculty");
      setFacultyTab("kb");
    } else {
      setPortalTab("end_user");
      setEndUserTab("guides");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation Bar: Separated End User vs Faculty Tabs */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setPortalTab("end_user");
              setEndUserTab("chat");
            }}
            className="flex items-center gap-2.5 shrink-0 focus-visible:outline-2 focus-visible:outline-[#0055A2] rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-[#E5A823] text-[#003E7E] flex items-center justify-center shrink-0">
              <Shield className="w-4.5 h-4.5 stroke-[2.25]" aria-hidden="true" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-[#0055A2] whitespace-nowrap">
              SpartanAssist
            </span>
          </button>

          {/* Zone 2: Primary Separated Portal Switcher (End User vs Faculty) */}
          <nav
            aria-label="Portal role switcher"
            className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-xl"
          >
            {portalNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = portalTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectPortal(item.id)}
                  className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[#0055A2] ${
                    isActive
                      ? "bg-white text-[#0055A2] font-semibold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary CTA */}
          <button
            type="button"
            onClick={handleTalkToPersonCta}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0055A2] hover:bg-[#004482] text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#0055A2]"
          >
            <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Talk to a person</span>
          </button>
        </div>

        {/* Workspace Sub-Navigation Strip for Active Portal */}
        <div className="border-t border-slate-100 bg-slate-50/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4 overflow-x-auto">
            {portalTab === "end_user" ? (
              <nav aria-label="End User functions" className="flex items-center gap-2">
                {endUserNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = endUserTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setEndUserTab(item.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[#0055A2] ${
                        isActive
                          ? "bg-blue-50 text-[#0055A2] font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            ) : (
              <nav aria-label="Faculty functions" className="flex items-center gap-2">
                {facultyNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = facultyTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectFacultySubTab(item.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[#0055A2] ${
                        isActive
                          ? "bg-blue-50 text-[#0055A2] font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}
            <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
              {portalTab === "end_user"
                ? "Student & Campus Self-Service"
                : "Faculty & IT Staff Console"}
            </span>
          </div>
        </div>
      </header>

      {/* Active Workspace Views (kept mounted for instant switches & state retention) */}
      <main className="flex-1">
        {/* END USER PORTAL */}
        <div className={portalTab === "end_user" ? "block" : "hidden"}>
          <div className={endUserTab === "chat" ? "block" : "hidden"}>
            <HelpChatView
              audience="end_user"
              services={services}
              geminiAvailable={geminiAvailable}
              mode={mode}
              onModeChange={setMode}
              onOpenGuides={() => setEndUserTab("guides")}
              onInspectKBArticle={(docId) => handleInspectKBArticle(docId, "end_user")}
              kbArticles={articles}
              externalHumanTrigger={humanTrigger}
            />
          </div>
          <div className={endUserTab === "guides" ? "block" : "hidden"}>
            <KnowledgeBaseView
              audience="end_user"
              articles={articles}
              chunks={chunks}
              thresholds={thresholds}
              mode={mode}
              geminiAvailable={geminiAvailable}
              initialArticleId={selectedKbId}
            />
          </div>
        </div>

        {/* FACULTY PORTAL */}
        <div className={portalTab === "faculty" ? "block" : "hidden"}>
          <div className={facultyTab === "tickets" ? "block" : "hidden"}>
            <StaffConsoleView refreshTrigger={staffRefresh} />
          </div>
          <div className={facultyTab === "trace" ? "block" : "hidden"}>
            <HelpChatView
              audience="faculty"
              services={services}
              geminiAvailable={geminiAvailable}
              mode={mode}
              onModeChange={setMode}
              onOpenTicketQueue={() => selectFacultySubTab("tickets")}
              onInspectKBArticle={(docId) => handleInspectKBArticle(docId, "faculty")}
              kbArticles={articles}
              externalHumanTrigger={0}
            />
          </div>
          <div className={facultyTab === "kb" ? "block" : "hidden"}>
            <KnowledgeBaseView
              audience="faculty"
              articles={articles}
              chunks={chunks}
              thresholds={thresholds}
              mode={mode}
              geminiAvailable={geminiAvailable}
              initialArticleId={selectedKbId}
            />
          </div>
          <div className={facultyTab === "validation" ? "block" : "hidden"}>
            <ValidationLabView defaultMode={mode} geminiAvailable={geminiAvailable} />
          </div>
        </div>
      </main>

      {/* Subtle Desktop Footer */}
      <footer className="hidden md:block border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            SpartanAssist · Multi-Agent AI IT Help Desk · Team Auto-Mates (BUS4-118S Capstone)
          </span>
          <span>
            Simulated campus IT knowledge base and ticketing workspace · Not official SJSU IT
            guidance
          </span>
        </div>
      </footer>

      {/* Mobile Bottom Portal Bar (375px viewports) */}
      <nav
        aria-label="Mobile portal switcher"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-2"
      >
        {portalNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = portalTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPortal(item.id)}
              className={`min-h-[56px] flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                isActive ? "text-[#0055A2] font-semibold" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
