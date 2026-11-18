import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Layers,
  Search,
  Sparkles,
} from "lucide-react";
import { maskSensitiveText } from "../lib/privacy";
import type { KBArticle, KBChunk, RetrievedChunk, RunMode } from "../types";

interface KnowledgeBaseViewProps {
  audience?: "end_user" | "faculty";
  articles: KBArticle[];
  chunks: KBChunk[];
  thresholds: Record<RunMode, number>;
  mode: RunMode;
  geminiAvailable: boolean;
  initialArticleId?: string | null;
}

const CATEGORIES = [
  "all",
  "network",
  "authentication",
  "software",
  "hardware",
  "email",
  "printing",
  "learning_platform",
  "security",
  "policy",
] as const;

const SAMPLE_RAG_QUERIES = [
  "wifi in the library keeps disconnecting",
  "I got a new phone and Duo pushes don't come anymore",
  "Account disabled message and my midterm starts in 10 minutes",
  "What's the best pizza place near campus?",
];

export default function KnowledgeBaseView({
  audience = "faculty",
  articles,
  chunks,
  thresholds,
  mode,
  geminiAvailable,
  initialArticleId,
}: KnowledgeBaseViewProps) {
  const isFaculty = audience === "faculty";
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [articleSearch, setArticleSearch] = useState<string>("");
  const [selectedArticleId, setSelectedArticleId] = useState<string>(
    initialArticleId ?? articles[0]?.id ?? "KB-NET-01"
  );
  const [ragQuery, setRagQuery] = useState<string>(SAMPLE_RAG_QUERIES[0]);
  const [ragCategoryHint, setRagCategoryHint] = useState<string>("");
  const [ragMode, setRagMode] = useState<RunMode>(mode);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResult, setRagResult] = useState<{
    hits: RetrievedChunk[];
    usedEmbeddings: string;
  } | null>(null);

  useEffect(() => {
    if (initialArticleId) {
      setSelectedArticleId(initialArticleId);
      setSelectedCategory("all");
    }
  }, [initialArticleId]);

  useEffect(() => {
    if (isFaculty) {
      runRagTest(SAMPLE_RAG_QUERIES[0], "", ragMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFaculty]);

  async function runRagTest(q: string, catHint: string, testMode: RunMode) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const safeQuery = maskSensitiveText(trimmed).masked;
    if (safeQuery !== q) {
      setRagQuery(safeQuery);
    }
    setRagLoading(true);
    try {
      const params = new URLSearchParams({ q: safeQuery, mode: testMode });
      if (catHint) params.set("category", catHint);
      const res = await fetch(`/api/kb?${params.toString()}`);
      const data = await res.json();
      setRagResult(data.search ?? { hits: [], usedEmbeddings: "tfidf-local" });
    } finally {
      setRagLoading(false);
    }
  }

  const normalizedQuery = articleSearch.trim().toLowerCase();
  const filteredArticles = articles.filter((a) => {
    if (selectedCategory !== "all" && a.category !== selectedCategory) return false;
    if (!normalizedQuery) return true;
    return (
      a.title.toLowerCase().includes(normalizedQuery) ||
      a.body.toLowerCase().includes(normalizedQuery) ||
      a.category.toLowerCase().includes(normalizedQuery) ||
      a.id.toLowerCase().includes(normalizedQuery)
    );
  });

  const activeArticle =
    filteredArticles.find((a) => a.id === selectedArticleId) ??
    articles.find((a) => a.id === selectedArticleId) ??
    filteredArticles[0] ??
    null;

  const activeArticleChunks = activeArticle
    ? chunks.filter((c) => c.doc_id === activeArticle.id)
    : [];

  const activeThreshold =
    ragResult?.usedEmbeddings === "gemini-embedding-2"
      ? thresholds.gemini
      : thresholds.offline;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 tracking-tight">
            {isFaculty ? "Knowledge Base & RAG Grounding Explorer" : "Self-Service Campus IT Guides"}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isFaculty
              ? `${articles.length} campus IT articles split into ${chunks.length} section-level chunks. Queries below the similarity floor are escalated instead of guessed.`
              : `Browse ${articles.length} campus IT guides for Wi-Fi, accounts, Duo MFA, Canvas, software, and printing.`}
          </p>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Simulated university IT knowledge base (not official SJSU IT guidance)</span>
        </div>
      </div>

      {/* Live RAG Similarity Tester (Faculty Only) */}
      {isFaculty && (
      <section
        aria-label="Live RAG Similarity Tester"
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
            <h2 className="font-display font-bold text-base text-slate-900">
              Live RAG Retriever &amp; Similarity Threshold Check
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Embeddings:</span>
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                disabled={!geminiAvailable}
                onClick={() => {
                  setRagMode("gemini");
                  runRagTest(ragQuery, ragCategoryHint, "gemini");
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  ragMode === "gemini"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900 disabled:opacity-40"
                }`}
              >
                Gemini Embedding 2
              </button>
              <button
                type="button"
                onClick={() => {
                  setRagMode("offline");
                  runRagTest(ragQuery, ragCategoryHint, "offline");
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  ragMode === "offline"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                TF-IDF + Synonyms
              </button>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runRagTest(ragQuery, ragCategoryHint, ragMode);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="Test any student question against the vector index..."
              aria-label="Test RAG query"
              className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-[#0055A2] focus:bg-white"
            />
          </div>
          <select
            aria-label="Optional intake category boost"
            value={ragCategoryHint}
            onChange={(e) => setRagCategoryHint(e.target.value)}
            className="min-h-[42px] px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-700"
          >
            <option value="">No category boost</option>
            {CATEGORIES.filter((c) => c !== "all").map((c) => (
              <option key={c} value={c}>
                Boost: {c} (+0.05)
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={ragLoading || !ragQuery.trim()}
            className="min-h-[42px] px-5 py-2 bg-[#0055A2] hover:bg-[#004482] disabled:bg-slate-200 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            {ragLoading ? "Retrieving..." : "Test Retrieval"}
          </button>
        </form>

        {/* Quick Sample Query Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Try:</span>
          {SAMPLE_RAG_QUERIES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setRagQuery(sample);
                runRagTest(sample, ragCategoryHint, ragMode);
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-[#0055A2]/50 hover:bg-slate-50 text-slate-700 transition-colors"
            >
              {sample}
            </button>
          ))}
        </div>

        {/* Retrieval Results */}
        {ragResult && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-medium text-slate-700">
                Top-2 Grounded Chunks{" "}
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>{" "}
                <span className="font-mono text-slate-600">{ragResult.usedEmbeddings}</span>
              </div>
              <div className="font-mono tabular-nums text-slate-500">
                Similarity floor: &ge; {activeThreshold.toFixed(2)}
              </div>
            </div>

            {ragResult.hits.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3 text-sm text-slate-700">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="font-semibold text-slate-900">
                    Ungrounded — 0 chunks cleared threshold ({activeThreshold.toFixed(2)})
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Hallucination guard active: Knowledge Agent marks{" "}
                    <span className="font-mono">grounded = false</span> and routes to out-of-scope
                    or human escalation instead of inventing steps.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ragResult.hits.map((hit) => (
                  <div
                    key={hit.chunk_id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory("all");
                          setSelectedArticleId(hit.doc_id);
                        }}
                        className="font-mono font-semibold text-[#0055A2] hover:underline"
                      >
                        {hit.doc_id} · {hit.chunk_id}
                      </button>
                      <span className="font-mono tabular-nums text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        sim {hit.similarity.toFixed(3)} (score {hit.score.toFixed(3)})
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{hit.section}</div>
                    <p className="text-xs text-slate-600 leading-relaxed">{hit.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {/* Article Catalog + Guide / Chunk Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Category Filter + Article List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#0055A2]" aria-hidden="true" />
                <span>{isFaculty ? "Articles" : "Guides"} ({filteredArticles.length})</span>
              </h2>
              <select
                aria-label="Filter KB articles by category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All categories" : c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                value={articleSearch}
                onChange={(e) => setArticleSearch(maskSensitiveText(e.target.value).masked)}
                placeholder={isFaculty ? "Filter articles..." : "Search guides (e.g. eduroam, Duo, Adobe)..."}
                aria-label="Search guides"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0055A2] focus:bg-white"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
            {filteredArticles.map((art) => {
              const isSelected = activeArticle?.id === art.id;
              const chunkCount = chunks.filter((c) => c.doc_id === art.id).length;
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setSelectedArticleId(art.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-[#0055A2]">{art.id}</span>
                    <span className="text-slate-500 font-mono tabular-nums">
                      {art.category.replace(/_/g, " ")}
                      {isFaculty ? ` · ${chunkCount} chunks` : ""}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-1">{art.title}</div>
                </button>
              );
            })}
            {filteredArticles.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                No guides matched your search. Try another keyword or clear filters.
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected Article & Section Chunks / Guide Steps */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          {activeArticle ? (
            <>
              <div className="border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                  <span className="font-semibold text-[#0055A2]">{activeArticle.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeArticle.category.replace(/_/g, " ")}</span>
                  {isFaculty && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{activeArticleChunks.length} indexed chunks</span>
                    </>
                  )}
                </div>
                <h2 className="font-display font-bold text-xl text-slate-900 mt-1">
                  {activeArticle.title}
                </h2>
              </div>

              <div className="space-y-4">
                {isFaculty && (
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span>Indexed Section Chunks (## Markdown Split)</span>
                  </div>
                )}
                {activeArticleChunks.map((chunk) => (
                  <div
                    key={chunk.chunk_id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#0055A2]" aria-hidden="true" />
                        {chunk.section}
                      </span>
                      {isFaculty && (
                        <span className="font-mono text-slate-500">{chunk.chunk_id}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{chunk.text}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500 py-10 text-center">
              Select a guide to view step-by-step instructions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
