import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Flag, Heart, ImagePlus, Loader2, MessageCircle, Trash2, X } from "lucide-react";
import { CreatorName, FixtureLine } from "@/components/creators/CreatorBits";
import { acceptsFile } from "@/lib/photoUpload";
import {
  REPORT_REASONS, TOPIC_ORDER, TOPICS, ago, dayLabel, tipTime,
  useBoard, useCreatePost, useCreateReply, useRemoveFromBoard, useReport, useSpaceImages, useToggleLike,
  type Attendance, type BoardPost, type BoardReply, type SpaceImage, type Topic,
} from "@/lib/creatorSpace";
import { clubDisplayName } from "@shared/teamIdentity";

const POST_MAX = 2000;
const REPLY_MAX = 1000;
const MAX_FILES = 6;

interface Viewer {
  userId: string;
  /** Where their pictures go: their creator id, or "swish" for the Swish team. */
  folder: string;
  isAdmin: boolean;
  /** Games they've said they'll be at, to tie a post to one. */
  myGames: Attendance[];
}

// ── Writing a post ────────────────────────────────────────────────────────

function Composer({ viewer }: { viewer: Viewer }) {
  const create = useCreatePost(viewer.folder);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<Topic>("general");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [gameKey, setGameKey] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // The checks would hold this post: its author is asked first. `uploaded` keeps
  // the pictures already sent, so "Post anyway" doesn't send them twice.
  const [nudge, setNudge] = useState<{ message: string; uploaded: SpaceImage[] } | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const input = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const reason = acceptsFile(f);
      if (reason) {
        setNotice(reason);
        continue;
      }
      if (next.length < MAX_FILES) next.push(f);
    }
    setFiles(next);
    setNudge(null);
  };

  const submit = (confirm = false) => {
    const body = text.trim();
    if (!body || create.isPending) return;
    setNotice(null);
    create.mutate(
      { topic, body, files, gameKey: gameKey || null, confirm, uploaded: confirm ? nudge?.uploaded : undefined },
      {
        onSuccess: (res) => {
          if (res.nudge) return setNudge({ message: res.message, uploaded: res.uploaded });
          setText("");
          setFiles([]);
          setGameKey("");
          setNudge(null);
          setOpen(false);
          setNotice(res.message);
        },
      },
    );
  };

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ch-input flex h-12 w-full items-center px-4 text-left text-[15px] text-[color:var(--ch-muted)]"
          data-testid="board-compose-open"
        >
          <span className="truncate">Share work, ask a question, find someone to shoot with…</span>
        </button>
        {notice && <p className="mt-2 text-[13px] text-[color:var(--ch-text-2)]">{notice}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-b border-[color:var(--ch-border)] pb-5"
      data-testid="board-composer"
    >
      <div role="radiogroup" aria-label="Topic" className="flex flex-wrap gap-1.5">
        {TOPIC_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={topic === t}
            onClick={() => setTopic(t)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${topic === t ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-text)]" : "border-[color:var(--ch-border)] text-[color:var(--ch-text-2)]"}`}
          >
            {TOPICS[t].label}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value.slice(0, POST_MAX));
          setNudge(null);
        }}
        rows={4}
        className="ch-input mt-3 w-full px-3.5 py-3 text-[16px] leading-relaxed sm:text-[15px]"
        placeholder={TOPICS[topic].prompt}
        aria-label="Your post"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative h-20 w-20 overflow-hidden rounded-lg bg-[color:var(--ch-surface-3)]">
              <img src={previews[i]} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setFiles(files.filter((_, j) => j !== i));
                  setNudge(null);
                }}
                aria-label={`Remove ${f.name}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewer.myGames.length > 0 && (
        <div className="mt-3">
          <label htmlFor="board-game" className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]">About one of your games (optional)</label>
          <select id="board-game" value={gameKey} onChange={(e) => setGameKey(e.target.value)} className="ch-input h-10 w-full px-3 text-[16px] sm:w-auto sm:min-w-[20rem] sm:text-[14px]">
            <option value="">No game</option>
            {viewer.myGames.map((a) =>
              a.game ? (
                <option key={a.game_key} value={a.game_key}>
                  {clubDisplayName(a.game.hometeam)} v {clubDisplayName(a.game.awayteam)} · {dayLabel(a.game.matchtime)} {tipTime(a.game.matchtime)}
                </option>
              ) : null,
            )}
          </select>
        </div>
      )}

      {nudge && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-[14px] text-[color:var(--ch-text)]" role="alert">
          <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /> <span>Want to rethink this one? {nudge.message}</span></p>
          <div className="mt-2 flex gap-3 text-[13px] font-semibold">
            <button type="button" onClick={() => setNudge(null)} className="text-[color:var(--ch-accent)]">Edit it</button>
            <button type="button" onClick={() => submit(true)} className="text-[color:var(--ch-text-2)]">Post anyway (a moderator checks it first)</button>
          </div>
        </div>
      )}
      {(create.error || notice) && <p className="mt-2 text-[13px] text-rose-600 dark:text-rose-400">{create.error?.message ?? notice}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!text.trim() || create.isPending || !!nudge} className="ch-btn ch-btn-primary h-10 px-5 disabled:opacity-60" data-testid="board-post">
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Post
        </button>
        <button type="button" onClick={() => input.current?.click()} disabled={files.length >= MAX_FILES} className="ch-btn ch-btn-ghost h-10 gap-1.5 px-3 text-[14px] disabled:opacity-50">
          <ImagePlus className="h-4 w-4" aria-hidden="true" /> Add pictures
        </button>
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => setOpen(false)} className="text-[14px] text-[color:var(--ch-text-2)]">Cancel</button>
        <span className="ml-auto text-[12px] tabular-nums text-[color:var(--ch-muted)]">{text.length}/{POST_MAX}</span>
      </div>
      <p className="mt-2 text-[12px] text-[color:var(--ch-muted)]">Only creators can see the board. Pictures here stay here: nothing is reused or shown in public.</p>
    </form>
  );
}

// ── Reading ───────────────────────────────────────────────────────────────

function ReportMenu({ type, id, onDone }: { type: "post" | "reply"; id: string; onDone: () => void }) {
  const report = useReport();
  return (
    <div className="mt-2">
      <p className="text-[12px] text-[color:var(--ch-muted)]">What's wrong with it?</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {REPORT_REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={report.isPending}
            onClick={() => report.mutate({ type, id, reason: r.id }, { onSuccess: onDone })}
            className="rounded-full border border-[color:var(--ch-border)] px-3 py-1 text-[12px] font-medium text-[color:var(--ch-text)]"
          >
            {r.label}
          </button>
        ))}
      </div>
      {report.error && <p className="mt-1 text-[12px] text-rose-500">{report.error.message}</p>}
    </div>
  );
}

/** Delete for your own (or anything, as an admin); a flag for everyone else's. */
function useActions({ type, id, mine, isAdmin }: { type: "post" | "reply"; id: string; mine: boolean; isAdmin: boolean }) {
  const remove = useRemoveFromBoard();
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const what = type === "post" ? "post" : "reply";
  return {
    buttons: (
      <span className="ml-auto flex shrink-0 items-center">
        {(mine || isAdmin) && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete this ${what}?`)) remove.mutate({ type, id });
            }}
            disabled={remove.isPending}
            aria-label={`Delete this ${what}`}
            className="-my-1 p-2.5 text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)] sm:p-1.5"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {!mine && !reported && (
          <button type="button" onClick={() => setReporting((v) => !v)} aria-label={`Report this ${what}`} aria-expanded={reporting} className="-my-1 p-2.5 text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)] sm:p-1.5">
            <Flag className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </span>
    ),
    below: (
      <>
        {reported && <p className="mt-1 text-[12px] text-[color:var(--ch-muted)]">Thanks. A moderator will take a look.</p>}
        {reporting && !reported && <ReportMenu type={type} id={id} onDone={() => { setReported(true); setReporting(false); }} />}
      </>
    ),
  };
}

function Reply({ reply, viewer }: { reply: BoardReply; viewer: Viewer }) {
  const mine = reply.user_id === viewer.userId;
  const actions = useActions({ type: "reply", id: reply.id, mine, isAdmin: viewer.isAdmin });
  const held = reply.status === "held";
  return (
    <li className="py-3">
      <div className="flex items-center gap-2">
        <CreatorName creator={reply.author} size={28} sub={ago(reply.created_at)} />
        {actions.buttons}
      </div>
      <p className={`mt-1.5 whitespace-pre-line pl-[38px] text-[15px] leading-snug [overflow-wrap:anywhere] ${held ? "text-[color:var(--ch-muted)]" : "text-[color:var(--ch-text)]"}`}>{reply.body}</p>
      <div className="pl-[38px]">
        {held && <p className="mt-1 text-[12px] text-[color:var(--ch-muted)]">Only you can see this. It's waiting for a moderator.</p>}
        {actions.below}
      </div>
    </li>
  );
}

function ReplyBox({ postId }: { postId: string }) {
  const create = useCreateReply(postId);
  const [text, setText] = useState("");
  const [nudge, setNudge] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submit = (confirm = false) => {
    const body = text.trim();
    if (!body || create.isPending) return;
    setNotice(null);
    create.mutate(
      { body, confirm },
      {
        onSuccess: (res) => {
          if (res.nudge) return setNudge(res.message);
          setText("");
          setNudge(null);
          setNotice(res.message);
        },
      },
    );
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="pt-1"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, REPLY_MAX));
            setNudge(null);
          }}
          rows={1}
          className="ch-input min-h-10 flex-1 resize-y px-3 py-2 text-[16px] sm:text-[14px]"
          placeholder="Reply"
          aria-label="Your reply"
        />
        <button type="submit" disabled={!text.trim() || create.isPending || !!nudge} className="ch-btn ch-btn-primary h-10 px-4 text-[14px] disabled:opacity-60">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Reply"}
        </button>
      </div>
      {nudge && (
        <div className="mt-2 text-[13px] text-[color:var(--ch-text)]" role="alert">
          <p>Want to rethink this one? {nudge}</p>
          <div className="mt-1 flex gap-3 font-semibold">
            <button type="button" onClick={() => setNudge(null)} className="text-[color:var(--ch-accent)]">Edit it</button>
            <button type="button" onClick={() => submit(true)} className="text-[color:var(--ch-text-2)]">Post anyway</button>
          </div>
        </div>
      )}
      {(create.error || notice) && <p className="mt-1 text-[12px] text-[color:var(--ch-text-2)]">{create.error?.message ?? notice}</p>}
    </form>
  );
}

/** One picture fills the width; more sit in a grid. Tapping opens the full picture. */
function Pictures({ images, urls }: { images: SpaceImage[]; urls: Record<string, string> | undefined }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);
  if (!images.length) return null;
  const single = images.length === 1;
  return (
    <>
      <div className={`mt-3 grid gap-1.5 ${single ? "" : images.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {images.map((img, i) => (
          <button
            key={img.path}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open picture ${i + 1} of ${images.length}`}
            className="block overflow-hidden rounded-lg bg-[color:var(--ch-surface-3)]"
            style={single ? { aspectRatio: `${img.w} / ${img.h}`, maxHeight: 560, maxWidth: "100%", width: img.h > img.w ? "min(100%, 380px)" : "100%" } : { aspectRatio: "1 / 1" }}
          >
            {urls?.[img.path] && <img src={urls[img.path]} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </button>
        ))}
      </div>
      {open != null && urls?.[images[open].path] && (
        <div role="dialog" aria-modal="true" aria-label="Picture" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          {/* The full-size copy when there is one; the board's copy shows underneath until it arrives. */}
          <img
            src={urls[images[open].full ?? ""] ?? urls[images[open].path]}
            alt=""
            className="max-h-full max-w-full bg-contain bg-center bg-no-repeat object-contain"
            style={{ backgroundImage: `url("${urls[images[open].path]}")`, aspectRatio: `${images[open].w} / ${images[open].h}` }}
          />
          <button type="button" aria-label="Close" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/10 p-2 text-white"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      )}
    </>
  );
}

function Post({ post, replies, viewer, urls }: { post: BoardPost; replies: BoardReply[]; viewer: Viewer; urls: Record<string, string> | undefined }) {
  const like = useToggleLike(viewer.userId);
  const [open, setOpen] = useState(false);
  const mine = post.user_id === viewer.userId;
  const liked = post.likes.some((l) => l.user_id === viewer.userId);
  const actions = useActions({ type: "post", id: post.id, mine, isAdmin: viewer.isAdmin });
  const held = post.status === "held";
  return (
    <article className="py-5" data-testid="board-post-item">
      <div className="flex items-center gap-2">
        <CreatorName creator={post.author} sub={<>{TOPICS[post.topic]?.label ?? "Post"} · {ago(post.created_at)}</>} />
        {actions.buttons}
      </div>
      <p className={`mt-3 whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere] ${held ? "text-[color:var(--ch-muted)]" : "text-[color:var(--ch-text)]"}`}>{post.body}</p>
      {post.game && (
        <div className="mt-3 border-l-2 border-[color:var(--ch-accent)] pl-3">
          <FixtureLine game={post.game} />
        </div>
      )}
      <Pictures images={post.images ?? []} urls={urls} />
      {held && <p className="mt-2 text-[12px] text-[color:var(--ch-muted)]">Only you can see this. It's waiting for a moderator.</p>}
      {actions.below}

      <div className="mt-3 flex items-center gap-5 text-[13px] text-[color:var(--ch-muted)]">
        <button
          type="button"
          onClick={() => like.mutate({ postId: post.id, liked })}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className={`-my-1 inline-flex min-h-10 items-center gap-1.5 pr-1 ${liked ? "text-rose-500" : ""}`}
        >
          <Heart className="h-[18px] w-[18px]" fill={liked ? "currentColor" : "none"} aria-hidden="true" />
          <span className="tabular-nums">{post.likes.length || ""}</span>
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="-my-1 inline-flex min-h-10 items-center gap-1.5">
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
          {replies.length ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
      </div>

      {open && (
        <div className="mt-1 border-l border-[color:var(--ch-border)] pl-4">
          {replies.length > 0 && (
            <ul className="divide-y divide-[color:var(--ch-border)]">
              {replies.map((r) => <Reply key={r.id} reply={r} viewer={viewer} />)}
            </ul>
          )}
          {post.status === "visible" && <ReplyBox postId={post.id} />}
        </div>
      )}
    </article>
  );
}

/** The members-only board: what creators are sharing, asking and planning. */
export default function BoardTab({ viewer }: { viewer: Viewer }) {
  const board = useBoard();
  const [topic, setTopic] = useState<Topic | "all">("all");
  const posts = useMemo(() => (board.data?.posts ?? []).filter((p) => topic === "all" || p.topic === topic), [board.data, topic]);
  const paths = useMemo(() => (board.data?.posts ?? []).flatMap((p) => (p.images ?? []).flatMap((i) => (i.full ? [i.path, i.full] : [i.path]))), [board.data]);
  const { data: urls } = useSpaceImages(paths);

  return (
    <div className="mx-auto max-w-2xl">
      <Composer viewer={viewer} />

      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter by topic">
        {(["all", ...TOPIC_ORDER] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={topic === t}
            onClick={() => setTopic(t)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold ${topic === t ? "bg-[color:var(--ch-text)] text-[color:var(--ch-bg)]" : "text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
          >
            {t === "all" ? "Everything" : TOPICS[t].label}
          </button>
        ))}
      </div>

      {board.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
      ) : board.isError ? (
        <p className="py-12 text-center text-[15px] text-[color:var(--ch-text-2)]">The board couldn't load. Try again in a moment.</p>
      ) : !posts.length ? (
        <p className="py-12 text-center text-[15px] text-[color:var(--ch-text-2)]">
          {topic === "all" ? "Nothing here yet. Say hello, share a frame you're proud of, or ask the first question." : `Nothing under ${TOPICS[topic].label} yet.`}
        </p>
      ) : (
        <div className="divide-y divide-[color:var(--ch-border)]">
          {posts.map((p) => <Post key={p.id} post={p} replies={board.data?.replies.get(p.id) ?? []} viewer={viewer} urls={urls} />)}
        </div>
      )}
    </div>
  );
}

export type { Viewer as BoardViewer };
