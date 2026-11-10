import { useEffect, useMemo, useRef, useState } from "react";
import TeamPicker from "@/components/creators/TeamPicker";
import { CRAFT_OPTIONS, OPEN_TO_OPTIONS, PillPicker } from "@/components/creators/CreatorBits";
import { Link, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Camera, Check, Download, ExternalLink, Eye, EyeOff, Loader2, Plus, Star, Trash2, Upload, X } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { PermissionBadge, PhotographerAvatar } from "@/components/media/PhotographerBits";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  MEDIA_QUERY_KEY,
  PERMISSIONS,
  PERMISSION_ORDER,
  PHOTOGRAPHER_COLUMNS,
  PHOTO_COLUMNS,
  TAG_TYPES,
  cleanHandle,
  creditLine,
  fetchTags,
  formatBytes,
  photoUrl,
  useMyPhotographer,
  type ContactPreference,
  type Photo,
  type PhotoPermission,
  type PhotoTag,
  type PhotoTagType,
  type Photographer,
} from "@/lib/mediaSpotlight";
import { acceptsFile, deletePhoto, originalDownloadUrl, prepareImage, uploadAvatar, uploadPhoto } from "@/lib/photoUpload";

const INPUT = "ch-input h-10 w-full px-3 text-[14px]";
const LABEL = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]";
const SMALL_BTN = "ch-btn ch-btn-ghost h-8 gap-1 px-2.5 text-[12px]";

type Tab = "profile" | "photos" | "upload";

// ── Profile ───────────────────────────────────────────────────────────────

function ProfileForm({ photographer, onSaved }: { photographer: Photographer; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => ({
    display_name: photographer.display_name,
    handle: cleanHandle(photographer.handle),
    bio: photographer.bio ?? "",
    location: photographer.location ?? "",
    crafts: photographer.crafts ?? [],
    open_to: photographer.open_to ?? [],
    attendance_public: !!photographer.attendance_public,
    instagram: photographer.socials?.instagram ?? "",
    x: photographer.socials?.x ?? "",
    website: photographer.socials?.website ?? "",
    email: photographer.socials?.email ?? "",
    contact_preference: photographer.contact_preference,
    credit_line: photographer.credit_line ?? "",
    default_permission: photographer.default_permission,
  }));
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("photographers")
      .update({
        display_name: draft.display_name.trim() || photographer.display_name,
        handle: cleanHandle(draft.handle) || null,
        bio: draft.bio.trim() || null,
        location: draft.location.trim() || null,
        crafts: draft.crafts,
        open_to: draft.open_to,
        attendance_public: draft.attendance_public,
        socials: {
          instagram: cleanHandle(draft.instagram) || undefined,
          x: cleanHandle(draft.x) || undefined,
          website: draft.website.trim() || undefined,
          email: draft.email.trim() || undefined,
        },
        contact_preference: draft.contact_preference,
        credit_line: draft.credit_line.trim() || null,
        default_permission: draft.default_permission,
      })
      .eq("id", photographer.id);
    setSaving(false);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Profile saved" });
      onSaved();
    }
  };

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return;
    const reason = acceptsFile(file);
    if (reason) return toast({ title: "That file won't work", description: reason, variant: "destructive" });
    setAvatarBusy(true);
    try {
      const path = await uploadAvatar(photographer.id, file);
      const { error } = await supabase.from("photographers").update({ avatar_path: path }).eq("id", photographer.id);
      if (error) throw new Error(error.message);
      onSaved();
    } catch (err: any) {
      toast({ title: "Couldn't update the avatar", description: err.message, variant: "destructive" });
    } finally {
      setAvatarBusy(false);
    }
  };

  const preview = creditLine({ credit_line: draft.credit_line, handle: draft.handle, display_name: draft.display_name });

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center gap-4">
        <PhotographerAvatar photographer={photographer} size={72} />
        <label className={`${SMALL_BTN} cursor-pointer`}>
          {avatarBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
          Change avatar
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void changeAvatar(e.target.files?.[0])} disabled={avatarBusy} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-name" className={LABEL}>Name</label>
          <input id="pf-name" required value={draft.display_name} onChange={set("display_name")} className={INPUT} />
        </div>
        <div>
          <label htmlFor="pf-handle" className={LABEL}>Handle</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[color:var(--ch-muted)]">@</span>
            <input id="pf-handle" value={draft.handle} onChange={set("handle")} className={`${INPUT} pl-7`} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="pf-bio" className={LABEL}>Bio</label>
          <textarea id="pf-bio" value={draft.bio} onChange={set("bio")} rows={3} className="ch-input w-full px-3 py-2 text-[14px]" placeholder="What you shoot, who you've worked with, what you're available for." />
        </div>
        <div>
          <label htmlFor="pf-location" className={LABEL}>Location</label>
          <input id="pf-location" value={draft.location} onChange={set("location")} className={INPUT} placeholder="e.g. Manchester" />
        </div>
      </div>

      <fieldset>
        <legend className={LABEL}>What you make</legend>
        <PillPicker label="What you make" options={CRAFT_OPTIONS} value={draft.crafts} onChange={(crafts) => setDraft((d) => ({ ...d, crafts }))} />
      </fieldset>

      <fieldset>
        <legend className={LABEL}>Open to</legend>
        <PillPicker label="Open to" options={OPEN_TO_OPTIONS} value={draft.open_to} onChange={(open_to) => setDraft((d) => ({ ...d, open_to }))} />
        <p className="mt-1.5 text-[12px] text-[color:var(--ch-muted)]">Shown to other creators, so they know what to ask you about.</p>
      </fieldset>

      <div>
        <div className={LABEL}>Teams you work with</div>
        <TeamPicker photographerId={photographer.id} />
        <p className="mt-1.5 text-[12px] text-[color:var(--ch-muted)]">Saved as you go. Their fixtures appear under Games in the creator space, where you say which ones you'll be at.</p>
      </div>

      <label className="flex items-start gap-3 text-[14px] text-[color:var(--ch-text)]">
        <input
          type="checkbox"
          checked={draft.attendance_public}
          onChange={(e) => setDraft((d) => ({ ...d, attendance_public: e.target.checked }))}
          className="mt-0.5 h-4 w-4 accent-[color:var(--ch-accent)]"
        />
        <span>
          Show the games I'll be at on my public profile
          <span className="block text-[12px] text-[color:var(--ch-muted)]">Off, only other creators see them. On, players and fans can see which games you're shooting.</span>
        </span>
      </label>

      <fieldset>
        <legend className={LABEL}>Socials and contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <input aria-label="Instagram" value={draft.instagram} onChange={set("instagram")} className={INPUT} placeholder="Instagram handle" />
          <input aria-label="X" value={draft.x} onChange={set("x")} className={INPUT} placeholder="X handle" />
          <input aria-label="Website" value={draft.website} onChange={set("website")} className={INPUT} placeholder="Website" />
          <input aria-label="Email" type="email" value={draft.email} onChange={set("email")} className={INPUT} placeholder="Contact email" />
        </div>
        <div className="mt-3">
          <label htmlFor="pf-contact" className={LABEL}>"Work with me" goes to</label>
          <select id="pf-contact" value={draft.contact_preference} onChange={set("contact_preference")} className={`${INPUT} sm:w-64`}>
            <option value="instagram">Instagram</option>
            <option value="email">Email</option>
            <option value="website">Website</option>
            <option value="x">X</option>
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend className={LABEL}>Credit and permissions</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-credit" className="mb-1 block text-[13px] text-[color:var(--ch-text-2)]">Preferred credit line</label>
            <input id="pf-credit" value={draft.credit_line} onChange={set("credit_line")} className={INPUT} placeholder={preview} />
            <p className="mt-1 text-[12px] text-[color:var(--ch-muted)]">Shown as: <span className="text-[color:var(--ch-text)]">{preview}</span></p>
          </div>
          <div>
            <label htmlFor="pf-perm" className="mb-1 block text-[13px] text-[color:var(--ch-text-2)]">Default permission for new uploads</label>
            <select id="pf-perm" value={draft.default_permission} onChange={set("default_permission")} className={INPUT}>
              {PERMISSION_ORDER.map((k) => <option key={k} value={k}>{PERMISSIONS[k].label}</option>)}
            </select>
            <p className="mt-1 text-[12px] text-[color:var(--ch-muted)]">{PERMISSIONS[draft.default_permission as PhotoPermission].description}</p>
          </div>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="ch-btn ch-btn-primary h-10 px-5 disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save profile
        </button>
        <Link href={`/media/photographers/${photographer.slug}`} className="inline-flex items-center gap-1 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
          View public profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </form>
  );
}

// ── Photos ────────────────────────────────────────────────────────────────

function usePhotographerPhotos(photographerId: string | undefined) {
  return useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "dashboard-photos", photographerId],
    enabled: !!photographerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select(PHOTO_COLUMNS).eq("photographer_id", photographerId!).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const photos = (data ?? []) as Photo[];
      const tags = await fetchTags(photos.map((p) => p.id));
      return { photos, tags };
    },
  });
}

function PhotoEditor({ photo, tags, onChanged }: { photo: Photo; tags: PhotoTag[]; onChanged: () => void }) {
  const [draft, setDraft] = useState({
    caption: photo.caption ?? "",
    event_name: photo.event_name ?? "",
    taken_at: photo.taken_at ?? "",
    permission: photo.permission,
    showcase_order: photo.showcase_order?.toString() ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [tagType, setTagType] = useState<PhotoTagType>("player");
  const [tagValue, setTagValue] = useState("");
  const dirty =
    draft.caption !== (photo.caption ?? "") ||
    draft.event_name !== (photo.event_name ?? "") ||
    draft.taken_at !== (photo.taken_at ?? "") ||
    draft.permission !== photo.permission ||
    draft.showcase_order !== (photo.showcase_order?.toString() ?? "");

  const update = async (patch: Partial<Photo>, label: string) => {
    setBusy(label);
    const { error } = await supabase.from("photos").update(patch).eq("id", photo.id);
    setBusy(null);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else onChanged();
  };

  const save = () =>
    update(
      {
        caption: draft.caption.trim() || null,
        event_name: draft.event_name.trim() || null,
        taken_at: draft.taken_at || null,
        permission: draft.permission,
        showcase_order: draft.showcase_order === "" ? null : Number(draft.showcase_order),
      },
      "save",
    );

  const addTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = tagValue.trim();
    if (!value) return;
    setBusy("tag");
    const { error } = await supabase.from("photo_tags").insert({ photo_id: photo.id, tag_type: tagType, tag_value: value });
    setBusy(null);
    if (error) toast({ title: "Couldn't add the tag", description: error.message, variant: "destructive" });
    else {
      setTagValue("");
      onChanged();
    }
  };

  const removeTag = async (id: string) => {
    const { error } = await supabase.from("photo_tags").delete().eq("id", id);
    if (error) toast({ title: "Couldn't remove the tag", description: error.message, variant: "destructive" });
    else onChanged();
  };

  const remove = async () => {
    if (!window.confirm("Delete this photo? The original and every web copy are removed.")) return;
    setBusy("delete");
    try {
      await deletePhoto(photo);
      onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't delete", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    try {
      window.open(await originalDownloadUrl(photo), "_blank", "noopener");
    } catch (err: any) {
      toast({ title: "Couldn't fetch the original", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="ch-card grid gap-4 p-4 md:grid-cols-[180px_1fr]" data-testid={`photo-editor-${photo.id}`}>
      <div>
        <div className="overflow-hidden rounded-lg" style={{ aspectRatio: `${photo.width && photo.height ? photo.width / photo.height : 1.5}`, background: photo.dominant_color || "var(--ch-surface-3)" }}>
          <img src={photoUrl(photo, "thumb")} alt={photo.caption || ""} className="h-full w-full object-cover" loading="lazy" />
        </div>
        <p className="mt-2 text-[12px] text-[color:var(--ch-muted)]">
          {photo.width}×{photo.height}{photo.file_size ? ` · ${formatBytes(photo.file_size)}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => update({ is_public: !photo.is_public }, "public")} className={SMALL_BTN} aria-pressed={photo.is_public}>
            {photo.is_public ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
            {photo.is_public ? "Public" : "Hidden"}
          </button>
          <button type="button" onClick={() => update({ is_showcase: !photo.is_showcase }, "showcase")} className={`${SMALL_BTN} ${photo.is_showcase ? "!border-[color:var(--ch-accent)] !text-[color:var(--ch-accent)]" : ""}`} aria-pressed={photo.is_showcase}>
            <Star className="h-3.5 w-3.5" aria-hidden="true" /> Showcase
          </button>
          <button type="button" onClick={download} className={SMALL_BTN}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Original</button>
          <button type="button" onClick={remove} disabled={busy === "delete"} className={`${SMALL_BTN} !text-red-600 dark:!text-red-400`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
          </button>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input aria-label="Caption" value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} className={INPUT} placeholder="Caption" />
          <input aria-label="Event or game" value={draft.event_name} onChange={(e) => setDraft({ ...draft, event_name: e.target.value })} className={INPUT} placeholder="Event or game" />
          <input aria-label="Date taken" type="date" value={draft.taken_at} onChange={(e) => setDraft({ ...draft, taken_at: e.target.value })} className={INPUT} />
          <select aria-label="Usage permission" value={draft.permission} onChange={(e) => setDraft({ ...draft, permission: e.target.value as PhotoPermission })} className={INPUT}>
            {PERMISSION_ORDER.map((k) => <option key={k} value={k}>{PERMISSIONS[k].label}</option>)}
          </select>
          {photo.is_showcase && (
            <input aria-label="Showcase order" type="number" min={1} value={draft.showcase_order} onChange={(e) => setDraft({ ...draft, showcase_order: e.target.value })} className={INPUT} placeholder="Showcase order (1 = first)" />
          )}
        </div>
        <p className="text-[12px] text-[color:var(--ch-muted)]">{PERMISSIONS[draft.permission].description}</p>

        <div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ch-surface-3)] py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-[color:var(--ch-text-2)]">
                <span className="text-[color:var(--ch-muted)]">{TAG_TYPES[t.tag_type]}:</span> {t.tag_value}
                <button type="button" onClick={() => removeTag(t.id)} aria-label={`Remove ${t.tag_value}`} className="rounded-full p-0.5 hover:bg-[color:var(--ch-border-strong)]">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addTag} className="mt-2 flex gap-2">
            <select aria-label="Tag type" value={tagType} onChange={(e) => setTagType(e.target.value as PhotoTagType)} className="ch-input h-9 px-2 text-[13px]">
              {(Object.keys(TAG_TYPES) as PhotoTagType[]).map((k) => <option key={k} value={k}>{TAG_TYPES[k]}</option>)}
            </select>
            <input aria-label="Tag" value={tagValue} onChange={(e) => setTagValue(e.target.value)} className="ch-input h-9 flex-1 px-3 text-[13px]" placeholder="Add a player, team, league or event" />
            <button type="submit" disabled={busy === "tag" || !tagValue.trim()} className={`${SMALL_BTN} h-9`}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Tag</button>
          </form>
        </div>

        {dirty && (
          <button type="button" onClick={save} disabled={busy === "save"} className="ch-btn ch-btn-primary h-9 px-4 text-[13px]">
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />} Save changes
          </button>
        )}
      </div>
    </div>
  );
}

// ── Upload ────────────────────────────────────────────────────────────────

type Job = { file: File; status: "queued" | "working" | "done" | "error"; note: string };

function UploadPanel({ photographer, onDone }: { photographer: Photographer; onDone: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [permission, setPermission] = useState<PhotoPermission>(photographer.default_permission);
  const [shared, setShared] = useState({ caption: "", event_name: "", taken_at: "", is_showcase: false });
  const [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next: Job[] = [];
    for (const file of Array.from(list)) {
      const reason = acceptsFile(file);
      next.push({ file, status: reason ? "error" : "queued", note: reason ?? formatBytes(file.size) });
    }
    setJobs((j) => [...j, ...next]);
    if (input.current) input.current.value = "";
  };

  const run = async () => {
    setRunning(true);
    let ok = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].status !== "queued") continue;
      const setJob = (patch: Partial<Job>) => setJobs((all) => all.map((j, k) => (k === i ? { ...j, ...patch } : j)));
      try {
        setJob({ status: "working", note: "Preparing" });
        const prepared = await prepareImage(jobs[i].file);
        await uploadPhoto(
          photographer.id,
          jobs[i].file,
          prepared,
          { caption: shared.caption, event_name: shared.event_name, taken_at: shared.taken_at || null, permission, is_showcase: shared.is_showcase },
          (step) => setJob({ note: step }),
        );
        setJob({ status: "done", note: "Uploaded" });
        ok++;
      } catch (err: any) {
        setJob({ status: "error", note: err.message || "Failed" });
      }
    }
    setRunning(false);
    if (ok) {
      toast({ title: ok === 1 ? "Photo uploaded" : `${ok} photos uploaded` });
      onDone();
    }
  };

  const queued = jobs.filter((j) => j.status === "queued").length;

  return (
    <div className="space-y-5">
      <label
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--ch-border-strong)] px-6 py-10 text-center transition-colors hover:border-[color:var(--ch-accent)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files);
        }}
      >
        <Upload className="h-6 w-6 text-[color:var(--ch-accent)]" aria-hidden="true" />
        <span className="text-[15px] font-semibold text-[color:var(--ch-text)]">Choose photos</span>
        <span className="text-[13px] text-[color:var(--ch-text-2)]">JPEG, PNG, WebP or HEIC, up to 30 MB each. Pick as many as you like.</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic" multiple className="sr-only" onChange={(e) => pick(e.target.files)} data-testid="photo-file-input" />
      </label>

      {jobs.length > 0 && (
        <ul className="divide-y divide-[color:var(--ch-border)] rounded-xl border border-[color:var(--ch-border)]">
          {jobs.map((j, i) => (
            <li key={`${j.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-[color:var(--ch-text)]">{j.file.name}</span>
              <span className={`shrink-0 ${j.status === "error" ? "text-red-600 dark:text-red-400" : j.status === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-[color:var(--ch-muted)]"}`}>
                {j.status === "working" && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {j.note}
              </span>
              {(j.status === "queued" || j.status === "error") && !running && (
                <button type="button" onClick={() => setJobs((all) => all.filter((_, k) => k !== i))} aria-label="Remove" className="rounded p-1 text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)]">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="up-perm" className={LABEL}>Usage permission for these photos</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSION_ORDER.map((k) => (
              <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${permission === k ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent-soft)]" : "border-[color:var(--ch-border)]"}`}>
                <input type="radio" name="permission" value={k} checked={permission === k} onChange={() => setPermission(k)} className="mt-0.5 accent-[color:var(--ch-accent)]" />
                <span>
                  <span className="block text-[14px] font-semibold text-[color:var(--ch-text)]">{PERMISSIONS[k].label}</span>
                  <span className="block text-[12px] text-[color:var(--ch-text-2)]">{PERMISSIONS[k].description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <input aria-label="Caption for all" value={shared.caption} onChange={(e) => setShared({ ...shared, caption: e.target.value })} className={INPUT} placeholder="Caption (optional, applies to all)" />
        <input aria-label="Event or game" value={shared.event_name} onChange={(e) => setShared({ ...shared, event_name: e.target.value })} className={INPUT} placeholder="Event or game (optional)" />
        <input aria-label="Date taken" type="date" value={shared.taken_at} onChange={(e) => setShared({ ...shared, taken_at: e.target.value })} className={INPUT} />
        <label className="flex items-center gap-2 text-[14px] text-[color:var(--ch-text)]">
          <input type="checkbox" checked={shared.is_showcase} onChange={(e) => setShared({ ...shared, is_showcase: e.target.checked })} className="accent-[color:var(--ch-accent)]" />
          Add to my showcase strip
        </label>
      </div>

      <label className="flex items-start gap-2.5 rounded-xl border border-[color:var(--ch-border)] p-3 text-[13px] text-[color:var(--ch-text-2)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[color:var(--ch-accent)]" data-testid="upload-consent" />
        <span>
          I own these photos (or hold the rights to them) and agree that Swish Assistant may use them as the permission above describes, credited as <strong className="text-[color:var(--ch-text)]">{creditLine(photographer)}</strong>.
          You can change the permission on any photo later.
        </span>
      </label>

      <button type="button" onClick={run} disabled={!consent || !queued || running} className="ch-btn ch-btn-primary h-11 px-5 text-[15px] disabled:opacity-60" data-testid="upload-start">
        {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {running ? "Uploading…" : queued ? `Upload ${queued} photo${queued === 1 ? "" : "s"}` : "Upload"}
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

/**
 * /media/dashboard — a photographer's own corner: edit the profile, upload
 * photos, tag them and set what Swish may do with each. Admins can open any
 * photographer's dashboard with ?photographer=<id>.
 */
export default function PhotographerDashboardPage() {
  const { user, isAdmin } = useAuth();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const adminTarget = isAdmin ? params.get("photographer") : null;
  const queryClient = useQueryClient();
  const mine = useMyPhotographer(adminTarget ? undefined : user?.id);
  const target = useQuery({
    queryKey: [...MEDIA_QUERY_KEY, "admin-target", adminTarget],
    enabled: !!adminTarget,
    queryFn: async () => {
      const { data, error } = await supabase.from("photographers").select(PHOTOGRAPHER_COLUMNS).eq("id", adminTarget!).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Photographer | null) ?? null;
    },
  });
  const photographer = adminTarget ? target.data : mine.data;
  const loading = adminTarget ? target.isLoading : mine.isLoading;
  const [tab, setTab] = useState<Tab>("profile");
  const photosQuery = usePhotographerPhotos(photographer?.id);
  const welcome = params.get("welcome") === "1";

  useEffect(() => {
    if (welcome) setTab("upload");
  }, [welcome]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });

  const shell = (children: React.ReactNode) => (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Creator dashboard | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 md:px-6 md:pt-9">{children}</main>
    </div>
  );

  if (loading) return shell(<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>);

  if (!photographer) {
    return shell(
      <div className="ch-rise max-w-xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Media Spotlight</div>
        <h1 className="ch-display mt-1.5 text-[2.25rem] font-bold uppercase leading-[0.95] tracking-tight text-[color:var(--ch-text)]">No creator profile yet</h1>
        <p className="mt-3 text-[15px] text-[color:var(--ch-text-2)]">
          {adminTarget
            ? "That photographer doesn't exist."
            : "Profiles are set up by Swish. If you shoot, film or design around the game, tell us who you are and we'll create yours."}
        </p>
        <Link href={adminTarget ? "/admin/media" : "/media#get-involved"} className="ch-btn ch-btn-primary mt-5 h-10 px-4">
          {adminTarget ? "Back to Media admin" : "Ask to join"}
        </Link>
      </div>,
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "photos", label: `Photos${photosQuery.data ? ` (${photosQuery.data.photos.length})` : ""}` },
    { id: "upload", label: "Upload" },
  ];

  return shell(
    <>
      <header className="ch-rise">
        <Link href={adminTarget ? "/admin/media" : "/dashboard"} className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {adminTarget ? "Media admin" : "Dashboard"}
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <PhotographerAvatar photographer={photographer} size={56} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">{adminTarget ? "Editing as admin" : "Your creator profile"}</div>
              <h1 className="ch-display mt-1 text-[2rem] font-bold uppercase leading-[0.95] tracking-tight text-[color:var(--ch-text)] md:text-[2.75rem]">{photographer.display_name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!adminTarget && photographer.status === "claimed" && (
              <Link href="/media/creators" className="ch-btn ch-btn-primary h-10 px-4" data-testid="dashboard-creator-space">Creator space</Link>
            )}
            <Link href={`/media/photographers/${photographer.slug}`} className="ch-btn ch-btn-ghost h-10 gap-1.5 px-4">
              Public profile <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
        {welcome && (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[14px] text-emerald-800 dark:text-emerald-300">
            Your profile is yours, and Swish+ is now on your account, free. Add a few photos to start, then pick your teams on the Profile tab.
          </div>
        )}
      </header>

      <div className="mt-6 flex gap-1 border-b border-[color:var(--ch-border)]" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[14px] font-semibold transition-colors ${tab === t.id ? "border-[color:var(--ch-accent)] text-[color:var(--ch-text)]" : "border-transparent text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
            data-testid={`dashboard-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "profile" && <ProfileForm key={photographer.updated_at} photographer={photographer} onSaved={refresh} />}
        {tab === "photos" &&
          (photosQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
          ) : !photosQuery.data?.photos.length ? (
            <div className="py-12 text-center text-[15px] text-[color:var(--ch-text-2)]">
              No photos yet.{" "}
              <button type="button" onClick={() => setTab("upload")} className="font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">Upload some</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-[color:var(--ch-text-2)]">
                Public photos show on your profile. Showcase photos lead your profile and fill the strip on the directory. Each photo's permission is shown as{" "}
                <PermissionBadge permission={photographer.default_permission} /> badges elsewhere on the site.
              </p>
              {photosQuery.data.photos.map((p) => (
                <PhotoEditor key={`${p.id}-${p.is_public}-${p.is_showcase}`} photo={p} tags={photosQuery.data!.tags.get(p.id) ?? []} onChanged={refresh} />
              ))}
            </div>
          ))}
        {tab === "upload" && (
          <UploadPanel
            photographer={photographer}
            onDone={() => {
              void refresh();
              setTab("photos");
            }}
          />
        )}
      </div>
    </>,
  );
}
