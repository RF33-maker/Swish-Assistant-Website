import { Camera, Globe, Instagram, Mail } from "lucide-react";
import { avatarUrl, cleanHandle, PERMISSIONS, socialHref, type PhotoPermission, type Photographer, type Socials } from "@/lib/mediaSpotlight";

/** The X logo, which lucide doesn't ship. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function PhotographerAvatar({ photographer, size = 56, className = "" }: { photographer: Pick<Photographer, "avatar_path" | "display_name">; size?: number; className?: string }) {
  const url = avatarUrl(photographer);
  const initials = photographer.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)] ring-1 ring-[color:var(--ch-border)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" width={size} height={size} className="h-full w-full object-cover" loading="lazy" /> : initials || <Camera className="h-1/2 w-1/2" />}
    </span>
  );
}

const SOCIAL_ITEMS: { key: keyof Socials; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: "instagram", label: "Instagram", Icon: ({ className }) => <Instagram className={className} aria-hidden="true" /> },
  { key: "x", label: "X", Icon: XIcon },
  { key: "website", label: "Website", Icon: ({ className }) => <Globe className={className} aria-hidden="true" /> },
  { key: "email", label: "Email", Icon: ({ className }) => <Mail className={className} aria-hidden="true" /> },
];

/** Icon links to a photographer's socials; the handle doubles as Instagram when no link is set. */
export function SocialLinks({ photographer, className = "", size = "h-4 w-4" }: { photographer: Pick<Photographer, "socials" | "handle" | "display_name">; className?: string; size?: string }) {
  const socials: Socials = { ...(photographer.socials || {}) };
  if (!socials.instagram && photographer.handle) socials.instagram = cleanHandle(photographer.handle);
  const links = SOCIAL_ITEMS.map((s) => ({ ...s, href: socialHref(s.key, socials[s.key]) })).filter((s) => s.href);
  if (!links.length) return null;
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {links.map(({ key, label, Icon, href }) => (
        <a
          key={key}
          href={href!}
          target={key === "email" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={`${photographer.display_name} on ${label}`}
          title={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ch-text-2)] transition-colors hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-text)]"
        >
          <Icon className={size} />
        </a>
      ))}
    </div>
  );
}

export function TeamChips({ teams, className = "", max }: { teams: string[]; className?: string; max?: number }) {
  if (!teams.length) return null;
  const shown = max ? teams.slice(0, max) : teams;
  const more = teams.length - shown.length;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((t) => (
        <span key={t} className="rounded-full bg-[color:var(--ch-surface-3)] px-2.5 py-0.5 text-[12px] font-medium text-[color:var(--ch-text-2)]">
          {t}
        </span>
      ))}
      {more > 0 && <span className="px-1 py-0.5 text-[12px] text-[color:var(--ch-muted)]">+{more} more</span>}
    </div>
  );
}

const PERMISSION_TONE: Record<PhotoPermission, string> = {
  use_with_credit: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  ask_first: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  showcase_only: "bg-slate-500/14 text-slate-700 dark:text-slate-300",
  paid_license: "bg-violet-500/14 text-violet-700 dark:text-violet-300",
};

export function PermissionBadge({ permission, className = "" }: { permission: PhotoPermission; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${PERMISSION_TONE[permission]} ${className}`} title={PERMISSIONS[permission].description}>
      {PERMISSIONS[permission].label}
    </span>
  );
}

export function HandleText({ handle, className = "" }: { handle: string | null; className?: string }) {
  const h = cleanHandle(handle);
  if (!h) return null;
  return <span className={className}>@{h}</span>;
}
