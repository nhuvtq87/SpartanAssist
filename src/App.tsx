import React, { useState, useEffect } from "react";
import {
  BookOpen,
  FlaskConical,
  MessageSquare,
  Shield,
  Ticket as TicketIcon,
  UserCheck,
} from "lucide-react";
import HelpChatView from "./components/HelpChatView";
import StaffConsoleView from "./components/StaffConsoleView";
import KnowledgeBaseView from "./components/KnowledgeBaseView";
import ValidationLabView from "./components/ValidationLabView";
import type { KBArticle, KBChunk, RunMode } from "./types";

type AppTab = "chat" | "staff" | "kb" | "validation";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("chat");
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

  const navItems: Array<{ id: AppTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "chat", label: "Help Chat", icon: MessageSquare },
    { id: "staff", label: "Ticket Queue", icon: TicketIcon },
    { id: "kb", label: "Knowledge Base", icon: BookOpen },
    { id: "validation", label: "Validation Lab", icon: FlaskConical },
  ];

  function selectTab(tab: AppTab) {
    setActiveTab(tab);
    if (tab === "staff") {
      setStaffRefresh((n) => n + 1);
    }
  }

  function handleTalkToPersonCta() {
    setActiveTab("chat");
    setHumanTrigger((n) => n + 1);
  }

  function handleInspectKBArticle(docId: string) {
    setSelectedKbId(docId);
    setActiveTab("kb");
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation Bar: 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => selectTab("chat")}
            className="flex items-center gap-2.5 shrink-0 focus-visible:outline-2 focus-visible:outline-[#0055A2] rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-[#E5A823] text-[#003E7E] flex items-center justify-center shrink-0">
              <Shield className="w-4.5 h-4.5 stroke-[2.25]" aria-hidden="true" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-[#0055A2] whitespace-nowrap">
              SpartanAssist
            </span>
          </button>

          {/* Zone 2: Primary Desktop Navigation Links */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[#0055A2] ${
                    isActive
                      ? "bg-blue-50 text-[#0055A2] font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
      </header>

      {/* Active Workspace View (kept mounted for instant tab switches & state retention) */}
      <main className="flex-1">
        <div className={activeTab === "chat" ? "block" : "hidden"}>
          <HelpChatView
            services={services}
            geminiAvailable={geminiAvailable}
            mode={mode}
            onModeChange={setMode}
            onOpenTicketQueue={() => selectTab("staff")}
            onInspectKBArticle={handleInspectKBArticle}
            kbArticles={articles}
            externalHumanTrigger={humanTrigger}
          />
        </div>
        <div className={activeTab === "staff" ? "block" : "hidden"}>
          <StaffConsoleView refreshTrigger={staffRefresh} />
        </div>
        <div className={activeTab === "kb" ? "block" : "hidden"}>
          <KnowledgeBaseView
            articles={articles}
            chunks={chunks}
            thresholds={thresholds}
            mode={mode}
            geminiAvailable={geminiAvailable}
            initialArticleId={selectedKbId}
          />
        </div>
        <div className={activeTab === "validation" ? "block" : "hidden"}>
          <ValidationLabView defaultMode={mode} geminiAvailable={geminiAvailable} />
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

      {/* Mobile Bottom Tab Bar (375px viewports) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`min-h-[56px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? "text-[#0055A2] font-semibold" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{item.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
