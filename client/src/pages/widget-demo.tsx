import { useState } from "react";

const DEMO_LEAGUE_SLUGS = [
  { slug: "uwe-summer-league-d1-2025", label: "UWE Summer League D1 2025 (test schema)" },
  { slug: "super-league-basketball-20252026", label: "Super League Basketball" },
  { slug: "british-championship-basketball-20252026", label: "British Championship Basketball" },
  { slug: "womens-super-league-basketball-championship-20252026", label: "Women's SLB Championship" },
];

const THEMES = [
  { name: "Light", bg: "#ffffff", text: "#1a1a1a", cardBg: "#f9fafb", border: "#e5e7eb" },
  { name: "Dark", bg: "#111827", text: "#f3f4f6", cardBg: "#1f2937", border: "#374151" },
  { name: "Navy", bg: "#0f172a", text: "#e2e8f0", cardBg: "#1e293b", border: "#334155" },
];

export default function WidgetDemo() {
  const [selectedLeague, setSelectedLeague] = useState(DEMO_LEAGUE_SLUGS[0].slug);
  const [theme, setTheme] = useState(THEMES[0]);
  const baseUrl = window.location.origin;

  const widgets = [
    {
      title: "League Standings",
      desc: "Embed live standings on any website",
      src: `${baseUrl}/widget/standings?leagueSlug=${selectedLeague}&layout=standard`,
      width: 400,
      height: 500,
    },
    {
      title: "League Leaders",
      desc: "Top performers across stat categories",
      src: `${baseUrl}/widget/league-leaders?leagueSlug=${selectedLeague}&layout=standard`,
      width: 400,
      height: 500,
    },
    {
      title: "Game Scores",
      desc: "Recent and upcoming game results",
      src: `${baseUrl}/widget/game-scores?leagueSlug=${selectedLeague}&layout=standard`,
      width: 400,
      height: 500,
    },
    {
      title: "League Leaders (Compact)",
      desc: "Fits neatly in a sidebar",
      src: `${baseUrl}/widget/league-leaders?leagueSlug=${selectedLeague}&layout=compact`,
      width: 320,
      height: 400,
    },
    {
      title: "Standings (Wide)",
      desc: "Full-width layout for content areas",
      src: `${baseUrl}/widget/standings?leagueSlug=${selectedLeague}&layout=wide`,
      width: 600,
      height: 400,
    },
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: theme.bg, color: theme.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Widget Embed Test Page</h1>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 24 }}>
            This page simulates how widgets look when embedded on an external website
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            {DEMO_LEAGUE_SLUGS.map(l => (
              <button
                key={l.slug}
                onClick={() => setSelectedLeague(l.slug)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: selectedLeague === l.slug ? "2px solid #ea580c" : `1px solid ${theme.border}`,
                  backgroundColor: selectedLeague === l.slug ? "#ea580c" : theme.cardBg,
                  color: selectedLeague === l.slug ? "#fff" : theme.text,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {THEMES.map(t => (
              <button
                key={t.name}
                onClick={() => setTheme(t)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: theme.name === t.name ? "2px solid #ea580c" : `1px solid ${t.border}`,
                  backgroundColor: t.cardBg,
                  color: t.text,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {t.name} Site
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350, 1fr))", gap: 32 }}>
          {widgets.map((w, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ marginBottom: 12, textAlign: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{w.title}</h3>
                <p style={{ fontSize: 12, opacity: 0.6 }}>{w.desc}</p>
              </div>

              <div
                style={{
                  backgroundColor: theme.cardBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: 16,
                  width: "fit-content",
                }}
              >
                <iframe
                  src={w.src}
                  width={w.width}
                  height={w.height}
                  style={{ border: "none", overflow: "hidden", borderRadius: 8, display: "block" }}
                  title={w.title}
                />
              </div>

              <div style={{ marginTop: 10, width: "100%", maxWidth: w.width + 32 }}>
                <p style={{ fontSize: 11, fontWeight: 600, opacity: 0.5, marginBottom: 4 }}>EMBED CODE:</p>
                <div
                  style={{
                    backgroundColor: theme.name === "Light" ? "#1e293b" : "#0f172a",
                    color: "#86efac",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "monospace",
                    overflowX: "auto",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    const code = `<iframe src="${w.src}" width="${w.width}" height="${w.height}" frameborder="0" style="border:none;overflow:hidden;" allowtransparency="true"></iframe>`;
                    navigator.clipboard.writeText(code);
                  }}
                  title="Click to copy"
                >
                  {`<iframe src="${w.src}" width="${w.width}" height="${w.height}" frameborder="0" style="border:none;overflow:hidden;"></iframe>`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 60, padding: 24, backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Sidebar Simulation</h2>
          <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>How a widget looks in a typical website sidebar (300px wide)</p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ width: 320, flexShrink: 0 }}>
              <iframe
                src={`${baseUrl}/widget/league-leaders?leagueSlug=${selectedLeague}&layout=compact`}
                width={320}
                height={400}
                style={{ border: "none", overflow: "hidden", borderRadius: 8, display: "block" }}
                title="Sidebar Widget"
              />
            </div>
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ padding: 20, backgroundColor: theme.bg, borderRadius: 8, border: `1px dashed ${theme.border}` }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Main Content Area</h3>
                <p style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.6 }}>
                  This simulates a typical website layout where the widget sits in a sidebar alongside the main content.
                  The compact widget (320x400) fits neatly in standard sidebar widths without overwhelming the page.
                </p>
                <p style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.6, marginTop: 12 }}>
                  The widget automatically handles all data fetching and rendering. No JavaScript setup required on the host site — just paste the iframe code and it works.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 40, padding: 24, backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Full-Width Embed</h2>
          <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>The wide layout spans the full content area</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <iframe
              src={`${baseUrl}/widget/standings?leagueSlug=${selectedLeague}&layout=wide`}
              width={600}
              height={400}
              style={{ border: "none", overflow: "hidden", borderRadius: 8, display: "block", maxWidth: "100%" }}
              title="Full-Width Widget"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
