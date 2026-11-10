import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, ExternalLink, Eye, EyeOff, Link2, Loader2, Mail, Plus, Star, Trash2 } from "lucide-react";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { PermissionBadge, PhotographerAvatar } from "@/components/media/PhotographerBits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  MEDIA_QUERY_KEY,
  PERMISSIONS,
  PERMISSION_ORDER,
  PHOTOGRAPHER_COLUMNS,
  PHOTO_COLUMNS,
  cleanHandle,
  craftTitle,
  creditLine,
  formatWeek,
  mediaApi,
  photoUrl,
  slugify,
  splitTeams,
  weekStart,
  type Craft,
  type Photo,
  type PhotoPermission,
  type Photographer,
  type Spotlight,
} from "@/lib/mediaSpotlight";
import { originalDownloadUrl } from "@/lib/photoUpload";

// Reached through AdminRoute. Every write is also checked by is_media_admin()
// in the row-level policies, so the page can't do more than the database allows.

type Tab = "photographers" | "spotlight" | "photos" | "applications" | "board";
const INPUT = "ch-input h-10 w-full px-3 text-[14px]";
const LABEL = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]";
const SMALL = "ch-btn ch-btn-ghost h-8 gap-1 px-2.5 text-[12px]";

function useAllPhotographers() {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "admin", "photographers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("photographers").select(PHOTOGRAPHER_COLUMNS).order("display_name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Photographer[];
    },
  });
}

async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: what });
  } catch {
    toast({ title: "Couldn't copy", description: text });
  }
}

// ── Photographers ─────────────────────────────────────────────────────────

function CreatePhotographer({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ display_name: "", handle: "", slug: "", instagram: "", email: "", location: "", teams: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v, ...(k === "display_name" && !slugTouched ? { slug: slugify(v) } : {}) }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("photographers").insert({
      display_name: form.display_name.trim(),
      handle: cleanHandle(form.handle) || null,
      slug: slugify(form.slug || form.display_name),
      socials: { instagram: cleanHandle(form.instagram || form.handle) || undefined, email: form.email.trim() || undefined },
      contact_preference: form.email.trim() && !form.instagram && !form.handle ? "email" : "instagram",
      location: form.location.trim() || null,
      teams: splitTeams(form.teams),
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast({ title: "Couldn't create the profile", description: error.message, variant: "destructive" });
    toast({ title: "Profile created", description: "Now send them an invite link." });
    setForm({ display_name: "", handle: "", slug: "", instagram: "", email: "", location: "", teams: "" });
    setSlugTouched(false);
    setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ch-btn ch-btn-primary h-10 px-4" data-testid="media-admin-new">
        <Plus className="h-4 w-4" aria-hidden="true" /> New photographer
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="ch-card p-4 md:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className={LABEL} htmlFor="np-name">Name</label><input id="np-name" required value={form.display_name} onChange={set("display_name")} className={INPUT} /></div>
        <div><label className={LABEL} htmlFor="np-handle">Handle</label><input id="np-handle" value={form.handle} onChange={set("handle")} className={INPUT} placeholder="@" /></div>
        <div>
          <label className={LABEL} htmlFor="np-slug">Profile URL</label>
          <input id="np-slug" required value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }} className={INPUT} />
          <p className="mt-1 truncate text-[11px] text-[color:var(--ch-muted)]">/media/photographers/{slugify(form.slug || form.display_name) || "…"}</p>
        </div>
        <div><label className={LABEL} htmlFor="np-ig">Instagram</label><input id="np-ig" value={form.instagram} onChange={set("instagram")} className={INPUT} placeholder="Defaults to the handle" /></div>
        <div><label className={LABEL} htmlFor="np-email">Email</label><input id="np-email" type="email" value={form.email} onChange={set("email")} className={INPUT} /></div>
        <div><label className={LABEL} htmlFor="np-location">Location</label><input id="np-location" value={form.location} onChange={set("location")} className={INPUT} /></div>
        <div className="sm:col-span-2 lg:col-span-3"><label className={LABEL} htmlFor="np-teams">Teams and leagues</label><input id="np-teams" value={form.teams} onChange={set("teams")} className={INPUT} placeholder="Comma separated" /></div>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="ch-btn ch-btn-primary h-10 px-4">{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Create profile</button>
        <button type="button" onClick={() => setOpen(false)} className="ch-btn ch-btn-ghost h-10 px-4">Cancel</button>
      </div>
    </form>
  );
}

function InviteDialog({ photographer, onClose }: { photographer: Photographer; onClose: () => void }) {
  const [email, setEmail] = useState(photographer.socials?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; expires_at: string; email: { sent: boolean; reason?: string } | null } | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      setResult(await mediaApi(`/api/admin/media/photographers/${photographer.id}/invite`, { body: { email: email.trim() } }));
    } catch (err: any) {
      toast({ title: "Couldn't create the link", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sa-pro">
        <DialogHeader>
          <DialogTitle>Invite {photographer.display_name}</DialogTitle>
          <DialogDescription>A single-use link that lasts 14 days. Creating a new one retires any earlier unused link.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-[12px]">{result.url}</code>
              <button type="button" onClick={() => copyText(result.url, "Link copied")} className={SMALL}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy</button>
            </div>
            <p className="text-[13px] text-[color:var(--ch-text-2)]">
              {result.email ? (result.email.sent ? `Emailed to ${email}.` : `Not emailed: ${result.email.reason}. Send the link yourself.`) : "Send this link by email or DM."}
            </p>
            <button type="button" onClick={onClose} className="ch-btn ch-btn-primary h-10 px-4">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="inv-email">Email the link to (optional)</label>
              <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="Leave blank to copy the link instead" />
            </div>
            <button type="button" onClick={create} disabled={busy} className="ch-btn ch-btn-primary h-10 px-4">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />} Create invite link
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PhotographersTab() {
  const { data, isLoading } = useAllPhotographers();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
  const [invite, setInvite] = useState<Photographer | null>(null);

  const update = async (p: Photographer, patch: Partial<Photographer>) => {
    const { error } = await supabase.from("photographers").update(patch).eq("id", p.id);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else void refresh();
  };

  const remove = async (p: Photographer) => {
    if (!window.confirm(`Delete ${p.display_name} and every photo on the profile? This can't be undone.`)) return;
    const { error } = await supabase.from("photographers").delete().eq("id", p.id);
    if (error) toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    else void refresh();
  };

  return (
    <div className="space-y-5">
      <CreatePhotographer onCreated={refresh} />
      {isLoading ? (
        <AdminPageNotice><Loader2 className="mx-auto h-5 w-5 animate-spin" /></AdminPageNotice>
      ) : !data?.length ? (
        <AdminPageNotice>No photographers yet. Create the first profile above.</AdminPageNotice>
      ) : (
        <ul className="divide-y divide-[color:var(--ch-border)] rounded-xl border border-[color:var(--ch-border)]">
          {data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3" data-testid={`admin-photographer-${p.slug}`}>
              <PhotographerAvatar photographer={p} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[color:var(--ch-text)]">{p.display_name}</span>
                  {p.handle && <span className="text-[13px] text-[color:var(--ch-text-2)]">@{cleanHandle(p.handle)}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.status === "claimed" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : p.status === "hidden" ? "bg-red-500/12 text-red-700 dark:text-red-300" : "bg-amber-500/14 text-amber-700 dark:text-amber-300"}`}>
                    {p.status}
                  </span>
                  {p.is_featured && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--ch-accent)]"><Star className="h-3 w-3" aria-hidden="true" /> Featured {p.featured_order ?? ""}</span>}
                </div>
                <div className="truncate text-[12px] text-[color:var(--ch-muted)]">{p.teams.join(", ") || "No teams listed"} · {creditLine(p)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {p.status !== "claimed" && (
                  <button type="button" onClick={() => setInvite(p)} className={SMALL}><Mail className="h-3.5 w-3.5" aria-hidden="true" /> Invite</button>
                )}
                <button type="button" onClick={() => update(p, { is_featured: !p.is_featured })} className={`${SMALL} ${p.is_featured ? "!border-[color:var(--ch-accent)] !text-[color:var(--ch-accent)]" : ""}`} aria-pressed={p.is_featured}>
                  <Star className="h-3.5 w-3.5" aria-hidden="true" /> {p.is_featured ? "Featured" : "Feature"}
                </button>
                {p.is_featured && (
                  <input
                    type="number"
                    min={1}
                    aria-label="Featured order"
                    defaultValue={p.featured_order ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v !== p.featured_order) void update(p, { featured_order: v });
                    }}
                    className="ch-input h-8 w-16 px-2 text-[12px]"
                    placeholder="#"
                  />
                )}
                <button type="button" onClick={() => update(p, { status: p.status === "hidden" ? (p.user_id ? "claimed" : "unclaimed") : "hidden" })} className={SMALL}>
                  {p.status === "hidden" ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p.status === "hidden" ? "Show" : "Hide"}
                </button>
                <Link href={`/media/dashboard?photographer=${p.id}`} className={SMALL}>Dashboard</Link>
                <Link href={`/media/photographers/${p.slug}`} className={SMALL}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Profile</Link>
                <button type="button" onClick={() => remove(p)} className={`${SMALL} !text-red-600 dark:!text-red-400`} aria-label={`Delete ${p.display_name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {invite && <InviteDialog photographer={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}

// ── Spotlight schedule ────────────────────────────────────────────────────

function SpotlightTab() {
  const { data: photographers } = useAllPhotographers();
  const queryClient = useQueryClient();
  const spotlights = useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "admin", "spotlights"],
    queryFn: async () => {
      const { data, error } = await supabase.from("spotlights").select("id, photographer_id, week_start, blurb, highlight_photo_ids, created_at").order("week_start", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Spotlight[];
    },
  });
  const [week, setWeek] = useState(weekStart());
  const [photographerId, setPhotographerId] = useState("");
  const [blurb, setBlurb] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const candidatePhotos = useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "admin", "spotlight-photos", photographerId],
    enabled: !!photographerId,
    queryFn: async () => {
      const { data } = await supabase.from("photos").select(PHOTO_COLUMNS).eq("photographer_id", photographerId).eq("is_public", true).order("is_showcase", { ascending: false }).order("created_at", { ascending: false }).limit(60);
      return (data ?? []) as Photo[];
    },
  });

  useEffect(() => {
    setPicked([]);
  }, [photographerId]);

  const byId = useMemo(() => new Map((photographers ?? []).map((p) => [p.id, p])), [photographers]);
  const [y, m, d] = week.split("-").map(Number);
  const snapped = weekStart(new Date(y, m - 1, d));
  const existing = spotlights.data?.find((s) => s.week_start === snapped);

  const load = (s: Spotlight) => {
    setWeek(s.week_start);
    setPhotographerId(s.photographer_id);
    setBlurb(s.blurb ?? "");
    setTimeout(() => setPicked(s.highlight_photo_ids), 0);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photographerId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("spotlights")
      .upsert({ week_start: snapped, photographer_id: photographerId, blurb: blurb.trim() || null, highlight_photo_ids: picked, created_by: user?.id ?? null }, { onConflict: "week_start" });
    setSaving(false);
    if (error) return toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    toast({ title: existing ? "Spotlight updated" : "Spotlight scheduled", description: formatWeek(snapped) });
    void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
  };

  const remove = async (s: Spotlight) => {
    if (!window.confirm(`Remove the spotlight for ${formatWeek(s.week_start)}?`)) return;
    const { error } = await supabase.from("spotlights").delete().eq("id", s.id);
    if (error) toast({ title: "Couldn't remove", description: error.message, variant: "destructive" });
    else void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
  };

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={save} className="ch-card space-y-4 p-4 md:p-5">
        <h2 className="ch-display text-[1.4rem] font-bold uppercase tracking-tight text-[color:var(--ch-text)]">{existing ? "Edit this week" : "Schedule a week"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="sp-week">Week</label>
            <input id="sp-week" type="date" value={week} onChange={(e) => e.target.value && setWeek(e.target.value)} className={INPUT} />
            <p className="mt-1 text-[11px] text-[color:var(--ch-muted)]">Snaps to Monday: {formatWeek(snapped)}</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="sp-who">Photographer</label>
            <select id="sp-who" required value={photographerId} onChange={(e) => setPhotographerId(e.target.value)} className={INPUT}>
              <option value="">Choose…</option>
              {(photographers ?? []).filter((p) => p.status !== "hidden").map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="sp-blurb">Blurb</label>
          <textarea id="sp-blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} className="ch-input w-full px-3 py-2 text-[14px]" placeholder="A line or two on why they're this week's pick. Falls back to their bio." />
        </div>
        {photographerId && (
          <div>
            <div className={LABEL}>Highlight photos ({picked.length}/4)</div>
            {candidatePhotos.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ch-muted)]" />
            ) : !candidatePhotos.data?.length ? (
              <p className="text-[13px] text-[color:var(--ch-text-2)]">No public photos yet; the section will use whatever they upload.</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {candidatePhotos.data.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => togglePick(p.id)} aria-pressed={on} className={`relative aspect-square overflow-hidden rounded-md ring-2 ${on ? "ring-[color:var(--ch-accent)]" : "ring-transparent"}`}>
                      <img src={photoUrl(p, "thumb")} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {on && <span className="absolute right-1 top-1 rounded-full bg-[color:var(--ch-accent)] p-0.5 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button type="submit" disabled={saving || !photographerId} className="ch-btn ch-btn-primary h-10 px-4 disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {existing ? "Update week" : "Schedule"}
        </button>
      </form>

      <div>
        <h2 className="ch-display text-[1.4rem] font-bold uppercase tracking-tight text-[color:var(--ch-text)]">Scheduled</h2>
        {spotlights.isLoading ? (
          <AdminPageNotice><Loader2 className="mx-auto h-5 w-5 animate-spin" /></AdminPageNotice>
        ) : !spotlights.data?.length ? (
          <AdminPageNotice>Nothing scheduled. The homepage section stays hidden until a week is set.</AdminPageNotice>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--ch-border)] rounded-xl border border-[color:var(--ch-border)]">
            {spotlights.data.map((s) => {
              const current = s.week_start === weekStart();
              const future = s.week_start > weekStart();
              return (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[14px]">
                      <span className="font-semibold text-[color:var(--ch-text)]">{byId.get(s.photographer_id)?.display_name ?? "Unknown"}</span>
                      <span className="text-[color:var(--ch-text-2)]">{formatWeek(s.week_start)}</span>
                      {current && <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Live now</span>}
                      {future && <span className="rounded-full bg-[color:var(--ch-surface-3)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ch-text-2)]">Queued</span>}
                    </div>
                    {s.blurb && <p className="truncate text-[12px] text-[color:var(--ch-muted)]">{s.blurb}</p>}
                  </div>
                  <button type="button" onClick={() => load(s)} className={SMALL}>Edit</button>
                  <button type="button" onClick={() => remove(s)} className={`${SMALL} !text-red-600 dark:!text-red-400`} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── All photos ────────────────────────────────────────────────────────────

function PhotosTab() {
  const { data: photographers } = useAllPhotographers();
  const queryClient = useQueryClient();
  const [who, setWho] = useState("");
  const [perm, setPerm] = useState<PhotoPermission | "">("");
  const [marking, setMarking] = useState<{ id: string; context: string } | null>(null);
  const { user } = useAuth();

  const photos = useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "admin", "photos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select(PHOTO_COLUMNS).order("created_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      const { data: logs } = await supabase.from("photo_usage_log").select("id, photo_id, used_at, context").order("used_at", { ascending: false }).limit(2000);
      const usage = new Map<string, { used_at: string; context: string | null }[]>();
      for (const l of (logs ?? []) as { photo_id: string; used_at: string; context: string | null }[]) usage.set(l.photo_id, [...(usage.get(l.photo_id) ?? []), l]);
      return { photos: (data ?? []) as Photo[], usage };
    },
  });
  const byId = useMemo(() => new Map((photographers ?? []).map((p) => [p.id, p])), [photographers]);
  const shown = (photos.data?.photos ?? []).filter((p) => (!who || p.photographer_id === who) && (!perm || p.permission === perm));

  const refresh = () => queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });

  const markUsed = async () => {
    if (!marking) return;
    const { error } = await supabase.from("photo_usage_log").insert({ photo_id: marking.id, used_by: user?.id ?? null, context: marking.context.trim() || null });
    if (error) toast({ title: "Couldn't log the use", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Use logged" });
      setMarking(null);
      void refresh();
    }
  };

  const toggleHidden = async (p: Photo) => {
    const { error } = await supabase.from("photos").update({ is_public: !p.is_public }).eq("id", p.id);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else void refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Photographer" value={who} onChange={(e) => setWho(e.target.value)} className="ch-input h-10 px-3 text-[14px]">
          <option value="">All photographers</option>
          {(photographers ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <select aria-label="Permission" value={perm} onChange={(e) => setPerm(e.target.value as PhotoPermission | "")} className="ch-input h-10 px-3 text-[14px]">
          <option value="">Any permission</option>
          {PERMISSION_ORDER.map((k) => <option key={k} value={k}>{PERMISSIONS[k].label}</option>)}
        </select>
      </div>
      {photos.isLoading ? (
        <AdminPageNotice><Loader2 className="mx-auto h-5 w-5 animate-spin" /></AdminPageNotice>
      ) : !shown.length ? (
        <AdminPageNotice>No photos match.</AdminPageNotice>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const owner = byId.get(p.photographer_id);
            const credit = owner ? creditLine(owner) : "";
            const uses = photos.data?.usage.get(p.id) ?? [];
            return (
              <li key={p.id} className="ch-card overflow-hidden">
                <div className="aspect-[4/3] bg-[color:var(--ch-surface-3)]" style={{ background: p.dominant_color || undefined }}>
                  <img src={photoUrl(p, "medium")} alt={p.caption || ""} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <PermissionBadge permission={p.permission} />
                    {!p.is_public && <span className="rounded-full bg-red-500/12 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">Hidden</span>}
                    <span className="text-[12px] text-[color:var(--ch-text-2)]">{owner?.display_name ?? "Unknown"}</span>
                  </div>
                  {p.caption && <p className="truncate text-[13px] text-[color:var(--ch-text)]">{p.caption}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => copyText(credit, "Credit copied")} className={SMALL} disabled={!credit}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy credit</button>
                    <button type="button" onClick={() => setMarking({ id: p.id, context: "" })} className={SMALL}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Mark used{uses.length ? ` (${uses.length})` : ""}</button>
                    <button type="button" onClick={() => originalDownloadUrl(p).then((u) => window.open(u, "_blank", "noopener")).catch((e) => toast({ title: "Couldn't fetch the original", description: e.message, variant: "destructive" }))} className={SMALL}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Original
                    </button>
                    <button type="button" onClick={() => toggleHidden(p)} className={SMALL}>{p.is_public ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />} {p.is_public ? "Hide" : "Show"}</button>
                  </div>
                  {marking?.id === p.id && (
                    <form onSubmit={(e) => { e.preventDefault(); void markUsed(); }} className="flex gap-2">
                      <input autoFocus value={marking.context} onChange={(e) => setMarking({ ...marking, context: e.target.value })} className="ch-input h-9 flex-1 px-3 text-[13px]" placeholder="Where it was used (post, article, link)" />
                      <button type="submit" className="ch-btn ch-btn-primary h-9 px-3 text-[13px]">Log</button>
                      <button type="button" onClick={() => setMarking(null)} className="ch-btn ch-btn-ghost h-9 px-3 text-[13px]">Cancel</button>
                    </form>
                  )}
                  {uses.length > 0 && (
                    <p className="text-[11px] text-[color:var(--ch-muted)]">Last used {new Date(uses[0].used_at).toLocaleDateString("en-GB")}{uses[0].context ? ` · ${uses[0].context}` : ""}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Applications ──────────────────────────────────────────────────────────

interface Application {
  id: string; name: string; email: string; handle: string | null; teams: string | null; message: string | null;
  status: "new" | "contacted" | "done"; created_at: string;
  crafts: Craft[]; user_id: string | null; photographer_id: string | null;
}

function ApplicationsTab() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // Claim links made here, for an applicant whose email didn't go (or to send by hand).
  const [links, setLinks] = useState<Record<string, string>>({});
  const apps = useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "admin", "applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photographer_applications")
        .select("id, name, email, handle, teams, message, status, created_at, crafts, user_id, photographer_id")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Application[];
    },
  });
  const setStatus = async (a: Application, status: Application["status"]) => {
    const { error } = await supabase.from("photographer_applications").update({ status }).eq("id", a.id);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
  };
  const approve = async (a: Application) => {
    setBusy(a.id);
    try {
      const res = await mediaApi<{ photographer: { slug: string }; claimed: boolean; url?: string; email?: { ok?: boolean } | null }>(`/api/admin/media/applications/${a.id}/approve`, { method: "POST" });
      if (res.url) setLinks((l) => ({ ...l, [a.id]: res.url! }));
      toast({
        title: res.claimed ? `${a.name} is in` : `Profile made for ${a.name}`,
        description: res.claimed ? "The profile is on their account, with Swish+. They've been emailed." : "They've been emailed a link to claim it.",
      });
      void queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
    } catch (err: any) {
      toast({ title: "Couldn't approve", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (apps.isLoading) return <AdminPageNotice><Loader2 className="mx-auto h-5 w-5 animate-spin" /></AdminPageNotice>;
  if (!apps.data?.length) return <AdminPageNotice>No applications yet. They arrive from the "Get involved" form on /media.</AdminPageNotice>;
  return (
    <ul className="divide-y divide-[color:var(--ch-border)] rounded-xl border border-[color:var(--ch-border)]">
      {apps.data.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="font-semibold text-[color:var(--ch-text)]">{a.name}</span>
              {a.handle && <span className="text-[color:var(--ch-text-2)]">@{a.handle}</span>}
              <a href={`mailto:${a.email}`} className="text-[color:var(--ch-accent)] hover:underline">{a.email}</a>
              <span className="text-[12px] text-[color:var(--ch-muted)]">{new Date(a.created_at).toLocaleDateString("en-GB")}</span>
            </div>
            <p className="text-[13px] text-[color:var(--ch-text-2)]">
              {craftTitle(a.crafts)}
              {a.user_id ? " · applied signed in, so approving links the profile to their account" : " · no account yet, so approving emails a claim link"}
            </p>
            {a.teams && <p className="text-[13px] text-[color:var(--ch-text-2)]">Covers: {a.teams}</p>}
            {a.message && <p className="mt-1 whitespace-pre-line text-[13px] text-[color:var(--ch-text-2)]">{a.message}</p>}
            {links[a.id] && (
              <p className="mt-1 break-all text-[12px] text-[color:var(--ch-muted)]">Claim link (works once, 14 days): <span className="select-all text-[color:var(--ch-text)]">{links[a.id]}</span></p>
            )}
          </div>
          {a.photographer_id ? (
            <span className="inline-flex h-9 items-center gap-1 rounded-full bg-emerald-500/12 px-3 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Profile made</span>
          ) : (
            <>
              <button type="button" onClick={() => approve(a)} disabled={busy === a.id} className="ch-btn ch-btn-primary h-9 px-3 text-[13px] disabled:opacity-60" data-testid="application-approve">
                {busy === a.id && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Approve
              </button>
              <select aria-label="Status" value={a.status} onChange={(e) => setStatus(a, e.target.value as Application["status"])} className="ch-input h-9 px-2 text-[13px]">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="done">Done</option>
              </select>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Creator board: what's held or reported ────────────────────────────────

interface QueueItem {
  id: string; body: string; status: "visible" | "held" | "removed"; report_count: number; created_at: string;
  moderation: { source?: string; categories?: string[]; note?: string } | null;
  author: { display_name: string; slug: string } | null;
  topic?: string; post_id?: string;
}

function BoardQueueTab() {
  const queryClient = useQueryClient();
  const key = [...MEDIA_QUERY_KEY, "admin", "board-queue"];
  const queue = useQuery({
    queryKey: key,
    queryFn: () => mediaApi<{ posts: QueueItem[]; replies: QueueItem[] }>("/api/admin/creators/queue"),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const review = async (type: "post" | "reply", id: string, action: "approve" | "remove") => {
    setBusy(id);
    try {
      await mediaApi("/api/admin/creators/review", { body: { type, id, action } });
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (queue.isLoading) return <AdminPageNotice><Loader2 className="mx-auto h-5 w-5 animate-spin" /></AdminPageNotice>;
  if (queue.isError) return <AdminPageNotice>The queue couldn't load.</AdminPageNotice>;
  const items = [
    ...(queue.data?.posts ?? []).map((i) => ({ ...i, type: "post" as const })),
    ...(queue.data?.replies ?? []).map((i) => ({ ...i, type: "reply" as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!items.length) {
    return (
      <AdminPageNotice>
        Nothing held or reported on the creator board. <Link href="/media/creators" className="font-semibold text-[color:var(--ch-accent)] hover:underline">Open the board</Link>
      </AdminPageNotice>
    );
  }
  return (
    <ul className="divide-y divide-[color:var(--ch-border)] rounded-xl border border-[color:var(--ch-border)]">
      {items.map((i) => (
        <li key={`${i.type}-${i.id}`} className="flex flex-wrap items-start gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-[color:var(--ch-text)]">{i.author?.display_name ?? "Swish team"}</span>
              <span className="text-[color:var(--ch-muted)]">{i.type === "post" ? "Post" : "Reply"} · {new Date(i.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.status === "held" ? "bg-amber-500/14 text-amber-700 dark:text-amber-300" : "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]"}`}>
                {i.status === "held" ? "Held" : `${i.report_count} ${i.report_count === 1 ? "report" : "reports"}`}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-line text-[14px] text-[color:var(--ch-text)] [overflow-wrap:anywhere]">{i.body}</p>
            {(i.moderation?.note || i.moderation?.categories?.length) && (
              <p className="mt-1 text-[12px] text-[color:var(--ch-muted)]">
                {[i.moderation.source, i.moderation.categories?.join(", "), i.moderation.note].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button type="button" onClick={() => review(i.type, i.id, "approve")} disabled={busy === i.id} className={SMALL}>Approve</button>
          <button type="button" onClick={() => review(i.type, i.id, "remove")} disabled={busy === i.id} className={`${SMALL} !text-red-600 dark:!text-red-400`}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function MediaSpotlightAdminPage() {
  const [tab, setTab] = useState<Tab>("photographers");
  const tabs: { id: Tab; label: string }[] = [
    { id: "photographers", label: "Photographers" },
    { id: "spotlight", label: "Weekly spotlight" },
    { id: "photos", label: "Photos & credit" },
    { id: "applications", label: "Applications" },
    { id: "board", label: "Creator board" },
  ];
  return (
    <AdminPageShell
      title="Media Spotlight"
      description="Photographer profiles, invite links, the weekly homepage spotlight, and the credit line for every photo."
      actions={<Link href="/media" className="ch-btn ch-btn-ghost h-10 gap-1.5 px-4"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Public page</Link>}
    >
      <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--ch-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-semibold transition-colors ${tab === t.id ? "border-[color:var(--ch-accent)] text-[color:var(--ch-text)]" : "border-transparent text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
            data-testid={`media-admin-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "photographers" && <PhotographersTab />}
        {tab === "spotlight" && <SpotlightTab />}
        {tab === "photos" && <PhotosTab />}
        {tab === "applications" && <ApplicationsTab />}
        {tab === "board" && <BoardQueueTab />}
      </div>
    </AdminPageShell>
  );
}
