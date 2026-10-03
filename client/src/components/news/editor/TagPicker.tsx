import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { TAG_KIND_ICON, TAG_KIND_LABEL } from "@/components/news/ArticleTagChips";
import { MAX_ARTICLE_TAGS, type ArticleTag } from "@shared/newsArticle";
import { mergeTags, searchTagCandidates, tagsForGame, type TagCandidate } from "./tagSearch";

/**
 * The pages an article is about. Type to find a league, team, player or game
 * and click to tag it; picking a game also tags its competition and both
 * teams, since an article about a game is about all of them.
 */
export default function TagPicker({ tags, onChange }: { tags: ArticleTag[]; onChange: (tags: ArticleTag[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TagCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchTagCandidates(term).catch(() => []);
      if (cancelled) return;
      setResults(found);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const tagged = new Set(tags.map((t) => `${t.kind}:${t.key}`));
  const full = tags.length >= MAX_ARTICLE_TAGS;

  const add = (candidate: TagCandidate) => {
    onChange(mergeTags(tags, candidate.game ? tagsForGame(candidate.game) : [candidate.tag]).slice(0, MAX_ARTICLE_TAGS));
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" />
        <input
          className="ch-input h-10 w-full pl-9 pr-9 text-[14px]"
          value={query}
          placeholder={full ? "Tag limit reached" : "Find a league, team, player or game"}
          disabled={full}
          aria-label="Search for a page to tag"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          data-testid="input-tag-search"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[color:var(--ch-muted)]" />}

        {open && query.trim().length >= 2 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-1.5 shadow-[var(--ch-shadow-lg)]">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[color:var(--ch-muted)]">
                {searching ? "Searching…" : "Nothing found. Try a team or player name."}
              </p>
            ) : (
              results.map((candidate) => {
                const { tag } = candidate;
                const Icon = TAG_KIND_ICON[tag.kind];
                const already = tagged.has(`${tag.kind}:${tag.key}`);
                return (
                  <button
                    key={`${tag.kind}:${tag.key}`}
                    type="button"
                    disabled={already}
                    onClick={() => add(candidate)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[color:var(--ch-surface-3)] disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[color:var(--ch-muted)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-[color:var(--ch-text)]">{tag.label}</span>
                      {candidate.detail && <span className="block truncate text-[12px] text-[color:var(--ch-muted)]">{candidate.detail}</span>}
                    </span>
                    <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--ch-muted)]">
                      {already ? "Added" : TAG_KIND_LABEL[tag.kind]}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-testid="editor-tags">
          {tags.map((tag) => {
            const Icon = TAG_KIND_ICON[tag.kind];
            return (
              <li
                key={`${tag.kind}:${tag.key}`}
                className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] pl-2.5 pr-1 text-[12.5px] text-[color:var(--ch-text)]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--ch-muted)]" />
                <span className="truncate">{tag.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${tag.label}`}
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--ch-muted)] hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
