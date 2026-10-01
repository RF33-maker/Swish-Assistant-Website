import { useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, ClipboardList, Clock, Mail, MessageSquare } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

const CONTACT_EMAIL = "automatedathleteswa@gmail.com";

type TopicKey = "general" | "player-page" | "coach" | "league";

// Why someone's getting in touch (?topic=), from the homepage plans and the
// "Claim this page" link on player profiles.
const TOPICS: Record<TopicKey, {
  label: string;
  icon: typeof Mail;
  title: string;
  intro: string;
  subject: string;
  message: (player?: string, url?: string) => string;
}> = {
  general: {
    label: "General",
    icon: MessageSquare,
    title: "Talk to Swish",
    intro: "Questions, ideas or something not quite right? Send us a message and we'll get back to you.",
    subject: "Swish Assistant enquiry",
    message: () => "",
  },
  "player-page": {
    label: "Claim a player page",
    icon: BadgeCheck,
    title: "Claim your player page",
    intro: "Tell us which page is yours and we'll check it's you, then hand you the keys.",
    subject: "Claim my player page",
    message: (player, url) =>
      `Hi, I'd like to claim my player page${player ? ` (${player})` : ""}.\n\n${url ? `My page: ${url}\n` : "My page (link or name): \n"}Team: \nBest way to verify me (e.g. club, coach or social account): \n`,
  },
  coach: {
    label: "Coaches",
    icon: ClipboardList,
    title: "Get your team on Swish",
    intro: "Coaches get their team's pages and the Coaches Hub. Tell us about your team.",
    subject: "Coaches Hub access for my team",
    message: () => "Hi, I coach a team and would like access to our team pages and the Coaches Hub.\n\nTeam: \nLeague: \nMy role: \n",
  },
  league: {
    label: "Leagues & clubs",
    icon: Building2,
    title: "Bring your league to Swish",
    intro: "Branded league pages, stats for every club and Coaches Hub access for your teams.",
    subject: "League enquiry",
    message: () => "Hi, I'd like to talk about bringing our league to Swish.\n\nLeague / organisation: \nNumber of teams: \n",
  },
};

const isTopic = (value: string | null): value is TopicKey => !!value && value in TOPICS;

export default function ContactSalesPage() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("topic");
  const player = params.get("player") || undefined;
  const pageUrl = params.get("url") || undefined;

  const [topic, setTopic] = useState<TopicKey>(isTopic(requested) ? requested : "general");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: TOPICS[isTopic(requested) ? requested : "general"].message(player, pageUrl),
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sentByEmail, setSentByEmail] = useState(false);

  const current = TOPICS[topic];

  // Switching topic swaps in its starter message, unless the visitor has
  // already written their own.
  const chooseTopic = (next: TopicKey) => {
    setFormData((f) => ({
      ...f,
      message: f.message === current.message(player, pageUrl) ? TOPICS[next].message(player, pageUrl) : f.message,
    }));
    setTopic(next);
  };

  // If the message can't be sent from here, open it in the visitor's own
  // email app instead, already addressed and filled in, so nothing is lost.
  const sendByEmail = () => {
    const body = `${formData.message}\n\n— ${formData.name} (${formData.email})`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(current.subject)}&body=${encodeURIComponent(body)}`;
    setSentByEmail(true);
    setSubmitted(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/contact-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, topic }),
      });
      if (response.ok) setSubmitted(true);
      else sendByEmail();
    } catch (error) {
      console.error("Contact form error:", error);
      sendByEmail();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{`${current.title} | Swish Assistant`}</title>
      </Helmet>
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
          {submitted ? (
            <div className="ch-card ch-rise max-w-xl mx-auto p-8 md:p-10 text-center" data-testid="contact-sent">
              <span className="mx-auto h-12 w-12 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <h1 className="mt-4 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] text-[color:var(--ch-text)]">
                {sentByEmail ? "Nearly there" : "Message sent"}
              </h1>
              <p className="mt-3 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">
                {sentByEmail
                  ? <>Your email app should have opened with your message ready to send to <span className="font-semibold text-[color:var(--ch-text)]">{CONTACT_EMAIL}</span> — just press send. We'll get back to you within 24 hours.</>
                  : "Thanks — we've got your message and will get back to you within 24 hours."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/" className="ch-btn ch-btn-primary h-10 px-5">Back to home</Link>
                {sentByEmail && (
                  <button type="button" onClick={() => { setSubmitted(false); setSentByEmail(false); }} className="ch-btn ch-btn-ghost h-10 px-5">
                    Edit message
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
              {/* Why get in touch */}
              <section className="lg:col-span-5 ch-rise" aria-labelledby="contact-heading">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Contact</div>
                <h1 id="contact-heading" className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
                  {current.title}
                </h1>
                <p className="mt-3 text-sm md:text-[15px] text-[color:var(--ch-text-2)] max-w-md">{current.intro}</p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                  <a href={`mailto:${CONTACT_EMAIL}`} className="ch-card ch-hover flex items-center gap-3 p-4">
                    <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]">
                      <Mail className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[color:var(--ch-text)]">Email us</span>
                      <span className="block text-xs text-[color:var(--ch-text-2)] truncate">{CONTACT_EMAIL}</span>
                    </span>
                  </a>
                  <div className="ch-card flex items-center gap-3 p-4">
                    <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]">
                      <Clock className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[color:var(--ch-text)]">Quick replies</span>
                      <span className="block text-xs text-[color:var(--ch-text-2)]">We answer within 24 hours</span>
                    </span>
                  </div>
                </div>

                {topic === "player-page" && (
                  <div className="mt-6 ch-tile p-4">
                    <div className="text-sm font-semibold text-[color:var(--ch-text)]">What happens next</div>
                    <ol className="mt-2 space-y-1.5 text-sm text-[color:var(--ch-text-2)] list-decimal pl-5">
                      <li>We check it's really you, usually through your club or coach.</li>
                      <li>Your page is linked to your Swish account.</li>
                      <li>You can update your details and photos, and download your cards.</li>
                    </ol>
                  </div>
                )}
              </section>

              {/* The form */}
              <section className="lg:col-span-7 ch-card ch-rise p-5 md:p-7" style={{ animationDelay: "80ms" }} aria-label="Send a message">
                <div className="text-sm font-semibold text-[color:var(--ch-text)]">What's it about?</div>
                <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Topic">
                  {(Object.keys(TOPICS) as TopicKey[]).map((key) => {
                    const t = TOPICS[key];
                    const active = key === topic;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-active={active}
                        onClick={() => chooseTopic(key)}
                        className="ch-chip inline-flex items-center gap-1.5 h-9 px-3.5 text-[13px]"
                      >
                        <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">Full name</span>
                      <input
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Your name"
                        autoComplete="name"
                        className="ch-input w-full h-11 px-3.5 text-[15px]"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">Email address</span>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="you@email.com"
                        autoComplete="email"
                        className="ch-input w-full h-11 px-3.5 text-[15px]"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">Message</span>
                    <textarea
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Tell us how we can help"
                      rows={7}
                      className="ch-input w-full px-3.5 py-3 text-[15px] leading-relaxed resize-y"
                    />
                  </label>
                  <button type="submit" disabled={submitting} className="ch-btn ch-btn-primary w-full h-11 justify-center text-[15px] disabled:opacity-60">
                    {submitting ? "Sending…" : "Send message"}
                    {!submitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                  <p className="text-xs text-[color:var(--ch-muted)] text-center">
                    By sending this you agree to us contacting you about your enquiry. We handle your details in line with our{" "}
                    <Link href="/privacy" className="font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] underline underline-offset-2">Privacy Policy</Link>.
                  </p>
                </form>
              </section>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
