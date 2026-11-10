import { useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import PhotographerShowcase from "@/components/media/PhotographerShowcase";
import CameraFlashes from "@/components/media/CameraFlashes";
import { mediaApi, useFeaturedPhotographers, type Craft } from "@/lib/mediaSpotlight";
import { CRAFT_OPTIONS, PillPicker } from "@/components/creators/CreatorBits";
import { useCreatorAccess } from "@/lib/creatorSpace";
import { useAuth } from "@/hooks/use-auth";

const SITE_URL = "https://swishassistant.com";
const EASE = [0.2, 0.7, 0.2, 1] as const;

function Tier({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 py-14 md:py-20" aria-labelledby={`${id}-heading`}>
      <motion.header
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="mb-8 md:mb-10"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">{eyebrow}</div>
        <h2 id={`${id}-heading`} className="ch-display mt-3 text-[2.25rem] font-bold uppercase leading-[0.92] tracking-tight text-[color:var(--ch-text)] md:text-[4rem]">{title}</h2>
        <p className="mt-3 max-w-2xl text-[15px] text-[color:var(--ch-text-2)] md:text-lg">{intro}</p>
      </motion.header>
      {children}
    </section>
  );
}

function GetInvolvedForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: (user as { email?: string } | null)?.email ?? "", handle: "", teams: "", message: "" });
  const [crafts, setCrafts] = useState<Craft[]>(["photo"]);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await mediaApi("/api/media/apply", { body: { ...form, crafts } });
      setState("sent");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div className="ch-card p-6">
        <div>
          <p className="font-semibold text-[color:var(--ch-text)]">Thanks, we've got it.</p>
          <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">
            {user
              ? "We'll set up your profile on this account, usually within a few days, and email you when the creator space is open for you."
              : "We'll set up your profile and send you a link to claim it, usually within a few days."}
          </p>
        </div>
      </div>
    );
  }

  const field = "ch-input h-11 w-full px-3.5 text-[15px]";
  const label = "mb-1.5 block text-[13px] font-medium text-[color:var(--ch-text)]";
  return (
    <form onSubmit={submit} className="ch-card p-5 md:p-7" data-testid="media-apply-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="apply-name" className={label}>Your name</label>
          <input id="apply-name" required value={form.name} onChange={set("name")} className={field} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="apply-email" className={label}>Email</label>
          <input id="apply-email" type="email" required value={form.email} onChange={set("email")} className={field} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="apply-handle" className={label}>Instagram or X handle</label>
          <input id="apply-handle" value={form.handle} onChange={set("handle")} className={field} placeholder="@" />
        </div>
        <div>
          <label htmlFor="apply-teams" className={label}>Teams or leagues you cover</label>
          <input id="apply-teams" value={form.teams} onChange={set("teams")} className={field} placeholder="e.g. Bristol Flyers, NBL D1" />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>What you make</div>
          <PillPicker label="What you make" options={CRAFT_OPTIONS} value={crafts} onChange={setCrafts} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="apply-message" className={label}>Anything else</label>
          <textarea id="apply-message" value={form.message} onChange={set("message")} rows={3} className="ch-input w-full px-3.5 py-2.5 text-[15px]" placeholder="A link to your portfolio, what you shoot, how you'd like to be credited…" />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "sending"} className="ch-btn ch-btn-primary h-11 px-5 text-[15px] disabled:opacity-60">
          {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Ask to join
        </button>
        <p className="text-[13px] text-[color:var(--ch-muted)]">
          We'll only use this to set up your profile.{!user && " Sign in first and the profile is linked to your account straight away."}
        </p>
      </div>
    </form>
  );
}

/**
 * /media — the front door of Media Spotlight: why it exists, a few featured
 * photographers with a strip of their work, and the way in for photographers.
 */
export default function MediaSpotlightPage() {
  const { data, isLoading } = useFeaturedPhotographers();
  const access = useCreatorAccess();
  const hero = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const heroFade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const canonical = `${SITE_URL}/media`;
  const description = "A space for the basketball media community to be celebrated. They do so much for the game, and this is our way of making sure it doesn't go unnoticed.";

  const stats = data && data.photographerCount > 0 && [
    [data.photographerCount.toLocaleString(), data.photographerCount === 1 ? "photographer" : "photographers"],
    [data.photoCount.toLocaleString(), "photos"],
  ];

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Media Spotlight | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Media Spotlight | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <div ref={hero} className="relative overflow-hidden">
        <CameraFlashes />
        {/* A lens, drawn slowly behind the headline */}
        <motion.svg aria-hidden="true" viewBox="0 0 800 600" className="pointer-events-none absolute -right-24 top-1/2 h-[130%] -translate-y-1/2 text-[color:var(--ch-accent)] opacity-[0.14]" style={{ y: heroY }} fill="none" stroke="currentColor" strokeWidth="2">
          <motion.circle cx="400" cy="300" r="240" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: "easeInOut" }} />
          <motion.circle cx="400" cy="300" r="170" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: 0.2, ease: "easeInOut" }} />
          <motion.circle cx="400" cy="300" r="60" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.4, ease: "easeInOut" }} />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <motion.line
              key={deg}
              x1={400 + 60 * Math.cos((deg * Math.PI) / 180)}
              y1={300 + 60 * Math.sin((deg * Math.PI) / 180)}
              x2={400 + 170 * Math.cos(((deg + 40) * Math.PI) / 180)}
              y2={300 + 170 * Math.sin(((deg + 40) * Math.PI) / 180)}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: 0.6 + deg / 600, ease: "easeInOut" }}
            />
          ))}
        </motion.svg>

        <motion.div style={{ y: heroY, opacity: heroFade }} className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-6 md:px-6 md:pb-14 md:pt-10">
          <h1 className="ch-display text-[3rem] font-bold uppercase leading-[0.88] tracking-tight text-[color:var(--ch-text)] sm:text-[4.5rem] md:text-[7rem]">
            {["Media", "spotlight"].map((w, i) => (
              <span key={w} className="block overflow-hidden">
                <motion.span className={`block ${i === 1 ? "text-[color:var(--ch-accent)]" : ""}`} initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.8, delay: 0.1 + i * 0.12, ease: EASE }}>{w}</motion.span>
              </span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45, ease: EASE }} className="mt-6 max-w-2xl text-lg text-[color:var(--ch-text-2)] md:text-xl">
            A space for the media community to be celebrated. They do so much for the game, and this is our way of making sure it doesn't go unnoticed.
          </motion.p>

          {stats && (
            <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
              {stats.map(([n, l]) => (
                <div key={l}>
                  <dd className="ch-display text-4xl font-bold text-[color:var(--ch-text)] md:text-5xl">{n}</dd>
                  <dt className="mt-1 text-xs uppercase tracking-wider text-[color:var(--ch-text-2)]">{l}</dt>
                </div>
              ))}
            </motion.dl>
          )}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/media/photographers" className="ch-btn ch-btn-primary h-11 px-5 text-[15px]" data-testid="media-directory-link">
              Meet the photographers <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {access.member && (
              <Link href="/media/creators" className="ch-btn ch-btn-ghost h-11 px-5 text-[15px]" data-testid="media-creator-space-link">
                Creator space
              </Link>
            )}
            <a href="#get-involved" className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
              Do you create around the game?
              <motion.span animate={{ y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}><ChevronDown className="h-4 w-4" aria-hidden="true" /></motion.span>
            </a>
          </motion.div>
        </motion.div>
      </div>

      <nav aria-label="Sections" className="sticky top-0 z-20 border-y border-[color:var(--ch-border)] bg-[color:color-mix(in_srgb,var(--ch-bg)_85%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 py-3 text-sm font-semibold text-[color:var(--ch-text-2)] [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden">
          {[["photographers", "The photographers"], ["creators", "For creators"], ["get-involved", "Get involved"]].map(([id, l]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap hover:text-[color:var(--ch-accent)]">{l}</a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
        <Tier id="photographers" eyebrow="The photographers" title="Worth your follow" intro="A few of the photographers whose work you'll see across Swish. Every one of them chose how their photos may be used.">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
          ) : data && data.photographers.length > 0 ? (
            <>
              <div>
                {data.photographers.map((p, i) => (
                  <PhotographerShowcase key={p.id} photographer={p} photos={data.strips.get(p.id) ?? []} delay={i * 60} />
                ))}
              </div>
              <div className="mt-6 border-t border-[color:var(--ch-border)] pt-6">
                <Link href="/media/photographers" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">
                  See every photographer <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <p className="text-[15px] text-[color:var(--ch-text-2)]">The first profiles are being set up now. If you shoot the game, the form below is the way in.</p>
          )}
        </Tier>

        <Tier id="creators" eyebrow="For creators" title="A room of your own" intro="Behind every profile is the creator space: a members-only room for the people who shoot, film and design around the game.">
          <dl className="divide-y divide-[color:var(--ch-border)] border-y border-[color:var(--ch-border)]">
            {[
              ["Talk and share", "A board that's just creators. Share work, swap advice, ask how someone got the shot."],
              ["Find each other at games", "Pick the teams you work with and the games you'll be at, and see who else will be courtside."],
              ["Ideas from the numbers", "The stats worth building a post around, for your teams and your games, every week."],
              ["Swish+ on us", "Every creator's account gets Swish+ free, as a thank you for what you give the game."],
            ].map(([title, body]) => (
              <div key={title} className="grid gap-1 py-4 sm:grid-cols-[16rem_1fr] sm:gap-6">
                <dt className="text-[16px] font-bold text-[color:var(--ch-text)]">{title}</dt>
                <dd className="text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">{body}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            <Link href="/media/creators" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">
              {access.member ? "Open the creator space" : "See the creator space"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Tier>

        <Tier id="get-involved" eyebrow="Get involved" title="Do you create around the game?" intro="Photographers, videographers, designers, the people running a club's socials: tell us who you are and we'll create your profile. You choose what to show, how your work may be used and how you're credited.">
          <GetInvolvedForm />
        </Tier>
      </main>
    </div>
  );
}
