import { useEffect, useState } from "react";
import { getAutoResizeSnippet } from "@/lib/widgetUtils";

interface CopyButtonProps {
  text: string;
  label?: string;
}

function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-2 right-2 px-2 py-1 rounded bg-slate-700 text-white text-[11px] font-semibold hover:bg-slate-600"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="bg-slate-900 text-green-300 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        <code>{children}</code>
      </pre>
      <CopyButton text={children} />
    </div>
  );
}

const widgetTypes = [
  {
    id: 'standings',
    title: 'League Standings',
    description: 'Team win/loss records, win percentage, and points per game.',
    required: ['leagueId or leagueSlug'],
    optional: ['teamName (filters to a single team)'],
  },
  {
    id: 'player-stats',
    title: 'Player Stats Card',
    description: 'A single player\'s averaged season stats and shooting splits.',
    required: ['playerId (UUID or slug)'],
    optional: ['leagueId or leagueSlug (helps when a player has played in multiple leagues)'],
  },
  {
    id: 'game-scores',
    title: 'Recent Game Scores',
    description: 'The most recent finished games for the league.',
    required: ['leagueId or leagueSlug'],
    optional: ['teamName (only games for a specific team)'],
  },
  {
    id: 'league-leaders',
    title: 'League Leaders',
    description: 'Top players across points, rebounds, assists, steals, and blocks.',
    required: ['leagueId or leagueSlug'],
    optional: [],
  },
];

const styleParams = [
  { name: 'primaryColor', desc: 'Hex colour for headings and highlights. Default `#ea580c`.' },
  { name: 'accentColor', desc: 'Hex colour for chips and dividers. Default `#f97316`.' },
  { name: 'bgColor', desc: 'Hex background colour. Use a dark value (e.g. `#0f172a`) for dark mode.' },
  { name: 'font', desc: 'Google Font name. One of: Inter, Roboto, Open Sans, Montserrat, Poppins, Lato, Source Sans Pro, Oswald.' },
  { name: 'borderRadius', desc: 'Corner radius in px (0–24).' },
  { name: 'layout', desc: '`compact`, `standard`, or `wide`. Sets default size.' },
  { name: 'width', desc: 'Override widget width in px (200–1200).' },
  { name: 'height', desc: 'Override widget height in px (200–1200).' },
];

export default function EmbedGuide() {
  const [origin, setOrigin] = useState('https://www.swishassistant.com');
  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const exampleUrl = `${origin}/widget/standings?leagueSlug=YOUR-LEAGUE-SLUG&layout=standard`;
  const fixedSnippet = `<iframe src="${exampleUrl}" width="400" height="500" frameborder="0" style="border:none;overflow:hidden;" allowtransparency="true" data-swish-widget></iframe>`;
  const responsiveSnippet = `<iframe src="${exampleUrl}" width="100%" height="500" frameborder="0" style="border:none;width:100%;display:block;overflow:hidden;" allowtransparency="true" data-swish-widget></iframe>`;
  const autoResizeSnippet = getAutoResizeSnippet();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Swish Assistant Embeddable Widgets</h1>
          <p className="mt-2 text-slate-600">
            Drop live basketball stats onto any website with a single iframe snippet. No login,
            no API keys, no build step.
          </p>
        </header>

        <section className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Quick start</h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-700">
            <li>Pick a widget type and find your league slug from the Widget Builder.</li>
            <li>Copy a snippet below into your site's HTML.</li>
            <li>(Optional) Drop the auto-resize script in once to make widgets grow with their content.</li>
          </ol>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Fixed-size snippet</h2>
          <p className="text-sm text-slate-600 mb-3">
            Best when you know exactly how much space you want the widget to occupy.
          </p>
          <CodeBlock>{fixedSnippet}</CodeBlock>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Responsive snippet</h2>
          <p className="text-sm text-slate-600 mb-3">
            Fills the width of its container. Pair with the auto-resize script to also grow vertically.
          </p>
          <CodeBlock>{responsiveSnippet}</CodeBlock>
        </section>

        <section id="auto-resize" className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Auto-resize script</h2>
          <p className="text-sm text-slate-600 mb-3">
            Paste this once anywhere on your page (just before <code>&lt;/body&gt;</code> works well).
            It listens for height messages from any Swish widget on the page and resizes the iframe
            so there are no scroll bars.
          </p>
          <CodeBlock>{autoResizeSnippet}</CodeBlock>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Widget types</h2>
          <div className="space-y-5">
            {widgetTypes.map(w => (
              <div key={w.id} className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-bold text-slate-900">{w.title}</h3>
                <p className="text-sm text-slate-600 mt-1">{w.description}</p>
                <p className="text-xs text-slate-500 mt-2">
                  <span className="font-semibold uppercase tracking-wide">URL: </span>
                  <code className="text-orange-700">/widget/{w.id}</code>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-semibold uppercase tracking-wide">Required: </span>
                  {w.required.join(', ')}
                </p>
                {w.optional.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="font-semibold uppercase tracking-wide">Optional: </span>
                    {w.optional.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Styling parameters</h2>
          <p className="text-sm text-slate-600 mb-4">
            All widgets accept the same look-and-feel parameters via the URL.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200">
                <th className="py-2 pr-4 font-semibold text-slate-700">Parameter</th>
                <th className="py-2 font-semibold text-slate-700">Description</th>
              </tr>
            </thead>
            <tbody>
              {styleParams.map(p => (
                <tr key={p.name} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-4 font-mono text-orange-700">{p.name}</td>
                  <td className="py-2 text-slate-600">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl border border-orange-100 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Troubleshooting</h2>
          <ul className="space-y-3 text-sm text-slate-700">
            <li>
              <strong>The iframe shows "League not found".</strong> Double-check the
              <code className="mx-1 text-orange-700">leagueSlug</code> matches the slug shown in your
              league URL on Swish Assistant. Private leagues are not embeddable.
            </li>
            <li>
              <strong>The widget is the wrong height.</strong> Either set <code className="mx-1 text-orange-700">height</code>
              on the iframe, or drop in the auto-resize script above so it grows automatically.
            </li>
            <li>
              <strong>The widget is blank on my page.</strong> Check your site's Content Security
              Policy. Our widgets allow framing from any origin (
              <code>frame-ancestors *</code>), but your CSP may block third-party iframes.
            </li>
            <li>
              <strong>Colours look off.</strong> Pass hex colours including the <code>#</code>, e.g.
              <code className="mx-1 text-orange-700">primaryColor=%23ea580c</code> if URL-encoding,
              or <code>primaryColor=#ea580c</code> when set in plain HTML.
            </li>
            <li>
              <strong>I get "No data yet".</strong> Widgets only show data that already exists in the
              league. Once games are imported they'll appear automatically &mdash; no embed change needed.
            </li>
          </ul>
        </section>

        <footer className="text-center text-xs text-slate-400 mt-10">
          Need help? Email <a href="mailto:hello@swishassistant.com" className="text-orange-600 hover:underline">hello@swishassistant.com</a>.
        </footer>
      </div>
    </div>
  );
}
