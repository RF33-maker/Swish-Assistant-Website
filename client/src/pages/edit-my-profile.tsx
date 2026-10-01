import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { AlertCircle, ArrowLeft, CheckCircle, ExternalLink, ImageUp, Loader2, UserRound } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ERROR, SUCCESS } from "@/components/layout/AuthShell";
import { supabase } from "@/lib/supabase";
import { normalizeInstagramHandle } from "@/lib/instagram";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import {
  type MyClaim,
  type OwnerFields,
  type PublicProfile,
  formatHeight,
  getMyClaim,
  getPublicProfile,
  rpcErrorMessage,
} from "@/lib/playerClaims";

// Owners edit player_owner_fields only — never public.players. RLS allows
// this for an approved claim and nothing else; DOB isn't editable here at all.
// Photos go to player-photos/owners/<player_id>/, the only folder an owner
// can write to.

const INPUT = "ch-input h-11 px-3.5 text-[15px] w-full";
const LABEL = "block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5";
const HINT = "mt-1.5 text-[12px] text-[color:var(--ch-muted)]";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const POSITIONS = ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Centre", "Guard", "Wing", "Forward", "Big"];

type Form = {
  bio: string;
  height: string;
  position: string;
  highlight: string;
  instagram: string;
};

function validate(f: Form): string | null {
  if (f.bio.length > 1000) return "Bio must be 1,000 characters or fewer.";
  if (f.height) {
    const h = Number(f.height);
    if (!Number.isInteger(h) || h < 120 || h > 240) return "Height must be a whole number of centimetres between 120 and 240.";
  }
  if (f.position.length > 40) return "Position must be 40 characters or fewer.";
  if (f.highlight && !/^https:\/\/\S+$/.test(f.highlight.trim())) return "Highlight link must be a full https:// URL.";
  if (f.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(normalizeInstagramHandle(f.instagram))) {
    return "Instagram handle can only contain letters, numbers, full stops and underscores.";
  }
  return null;
}

export default function EditMyProfilePage() {
  const [claim, setClaim] = useState<MyClaim | null | undefined>(undefined);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [saved, setSaved] = useState<OwnerFields | null>(null);
  const [form, setForm] = useState<Form>({ bio: "", height: "", position: "", highlight: "", instagram: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const c = await getMyClaim();
      setClaim(c);
      if (c?.status !== "approved") return;
      const [{ data: fields, error }, pub] = await Promise.all([
        supabase
          .from("player_owner_fields")
          .select("player_id, bio, display_height_cm, position, pinned_highlight_url, photo_path, instagram_handle, updated_at")
          .eq("player_id", c.player_id)
          .maybeSingle(),
        c.profile_slug ? getPublicProfile(c.profile_slug) : Promise.resolve(null),
      ]);
      if (error) throw new Error(rpcErrorMessage(error));
      const f = fields as OwnerFields | null;
      setSaved(f);
      setProfile(pub);
      setForm({
        bio: f?.bio ?? "",
        height: f?.display_height_cm ? String(f.display_height_cm) : "",
        position: f?.position ?? "",
        highlight: f?.pinned_highlight_url ?? "",
        instagram: f?.instagram_handle ?? "",
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Couldn't load your profile" });
      setClaim((prev) => (prev === undefined ? null : prev));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!photo) return setPhotoPreview(null);
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pickPhoto = (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    if (!PHOTO_TYPES[file.type]) return setMessage({ type: "error", text: "Photo must be a JPG, PNG or WebP image." });
    if (file.size > MAX_PHOTO_BYTES) return setMessage({ type: "error", text: "Photo must be 5 MB or smaller." });
    setPhoto(file);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claim || claim.status !== "approved") return;
    const problem = validate(form);
    if (problem) return setMessage({ type: "error", text: problem });

    setSaving(true);
    setMessage(null);
    const playerId = claim.player_id;
    let uploadedPath: string | null = null;
    try {
      if (photo) {
        uploadedPath = `owners/${playerId}/${Date.now()}.${PHOTO_TYPES[photo.type]}`;
        const { error: upErr } = await supabase.storage
          .from("player-photos")
          .upload(uploadedPath, photo, { contentType: photo.type, cacheControl: "3600", upsert: false });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
      }

      const row = {
        player_id: playerId,
        bio: form.bio.trim() || null,
        display_height_cm: form.height ? Number(form.height) : null,
        position: form.position.trim() || null,
        pinned_highlight_url: form.highlight.trim() || null,
        instagram_handle: form.instagram ? normalizeInstagramHandle(form.instagram) : null,
        photo_path: uploadedPath ?? saved?.photo_path ?? null,
      };
      const { error } = await supabase.from("player_owner_fields").upsert(row, { onConflict: "player_id" });
      if (error) throw new Error(rpcErrorMessage(error, "Couldn't save your profile"));

      // Tidy up the previous upload once the new one is saved.
      if (uploadedPath && saved?.photo_path && saved.photo_path !== uploadedPath) {
        await supabase.storage.from("player-photos").remove([saved.photo_path]);
      }
      setPhoto(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
      setMessage({ type: "success", text: "Profile saved." });
    } catch (err: any) {
      if (uploadedPath) await supabase.storage.from("player-photos").remove([uploadedPath]);
      setMessage({ type: "error", text: err.message || "Couldn't save your profile" });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const currentPhotoUrl = photoPreview ?? getPlayerPhotoUrlCached(profile?.photo_path);
  const restricted = profile?.is_restricted ?? true;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Edit your profile | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16 space-y-5">
        <header className="ch-rise">
          {claim?.profile_slug && (
            <Link
              href={`/p/${claim.profile_slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to your profile
            </Link>
          )}
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Your player profile</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
            Edit profile
          </h1>
          {claim?.status === "approved" && (
            <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">{claim.player_name}</p>
          )}
        </header>

        {message && (
          <Alert className={message.type === "success" ? SUCCESS : ERROR}>
            {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {claim === undefined ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
          </div>
        ) : claim?.status !== "approved" ? (
          <div className="ch-card ch-rise p-6 text-center space-y-3">
            <p className="text-sm text-[color:var(--ch-text-2)]">
              {claim?.status === "pending"
                ? "Your claim is waiting for verification. You'll be able to edit your profile once it's approved."
                : "You don't have a verified player profile yet."}
            </p>
            <Link href="/claim" className="ch-btn ch-btn-primary h-9 px-4 text-[13px]">
              {claim?.status === "pending" ? "View claim status" : "Claim your profile"}
            </Link>
          </div>
        ) : (
          <form onSubmit={save} className="ch-card ch-rise p-5 md:p-7 space-y-5">
            <div>
              <span className={LABEL}>Photo</span>
              <div className="flex items-center gap-4">
                <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-[color:var(--ch-surface-3)] flex items-center justify-center">
                  {currentPhotoUrl ? (
                    <img src={currentPhotoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-8 w-8 text-[color:var(--ch-muted)]" />
                  )}
                </div>
                <div>
                  <button type="button" className="ch-btn ch-btn-ghost h-9 px-3.5 text-[13px]" onClick={() => fileRef.current?.click()}>
                    <ImageUp className="h-4 w-4" /> {currentPhotoUrl ? "Change photo" : "Upload photo"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => pickPhoto(e.target.files?.[0])}
                    data-testid="input-profile-photo"
                  />
                  <p className={HINT}>JPG, PNG or WebP, up to 5 MB.{photo && " Saved when you press Save."}</p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="bio" className={LABEL}>
                Bio
              </label>
              <textarea
                id="bio"
                className="ch-input w-full px-3.5 py-2.5 text-[15px] min-h-[120px]"
                maxLength={1000}
                value={form.bio}
                placeholder="Your game, your goals, where you've played…"
                onChange={set("bio")}
              />
              <p className={HINT}>
                {form.bio.length}/1000. Don't include contact details — this is public.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="position" className={LABEL}>
                  Position
                </label>
                <input
                  id="position"
                  list="position-options"
                  className={INPUT}
                  maxLength={40}
                  value={form.position}
                  placeholder={profile?.position ?? "e.g. Point Guard"}
                  onChange={set("position")}
                />
                <datalist id="position-options">
                  {POSITIONS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="height" className={LABEL}>
                  Height (cm)
                </label>
                <input
                  id="height"
                  type="number"
                  inputMode="numeric"
                  min={120}
                  max={240}
                  className={INPUT}
                  value={form.height}
                  placeholder="e.g. 188"
                  onChange={set("height")}
                />
                {form.height && formatHeight(Number(form.height)) && <p className={HINT}>{formatHeight(Number(form.height))}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="highlight" className={LABEL}>
                Highlight video link
              </label>
              <input
                id="highlight"
                type="url"
                className={INPUT}
                maxLength={500}
                value={form.highlight}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={set("highlight")}
              />
            </div>

            <div>
              <label htmlFor="instagram" className={LABEL}>
                Instagram
              </label>
              <input
                id="instagram"
                className={INPUT}
                maxLength={60}
                value={form.instagram}
                placeholder="yourhandle"
                onChange={set("instagram")}
              />
              {restricted && (
                <p className={HINT}>Social links only appear publicly for players verified as 18 or over.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="submit" className="ch-btn ch-btn-primary h-11 px-6 text-[15px] disabled:opacity-60" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
              {claim.profile_slug && (
                <Link
                  href={`/p/${claim.profile_slug}`}
                  className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
                >
                  <ExternalLink className="h-4 w-4" /> View public profile
                </Link>
              )}
            </div>
            <p className="text-[12px] text-[color:var(--ch-muted)]">
              Your date of birth can't be changed here. If it's wrong, contact us and we'll correct it.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
