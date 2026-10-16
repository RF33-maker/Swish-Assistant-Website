import { jsPDF } from "jspdf";
import { saveFile } from "@/lib/saveFile";

/**
 * Turns a scouting-agent game plan into something a coach can hand over:
 * a PDF to download or attach, and the same words as plain text for share
 * sheets and clipboards. Free looks carry only a headline, summary and two
 * priorities, so every section is optional.
 */

interface Call { call: string; why: string }
export interface ExportablePlan {
  headline?: string;
  summary?: string;
  howTheyPlay?: string;
  defendingThem?: { summary?: string; keys?: Call[] };
  attackingThem?: { summary?: string; keys?: Call[] };
  playersToStop?: Array<{ name: string; threat: string; plan: string }>;
  lineupsAndRotation?: { summary?: string; watchFor?: string[] };
  lateGame?: string;
  gamePlan?: Array<Call & { target?: string }>;
  confidence?: string;
}
export interface ExportableScout {
  opponentName: string;
  forTeamName: string | null;
  matchTime: string | null;
  generatedAt: string | null;
  plan: ExportablePlan;
}

type Block = { kind: "title" | "heading" | "lead" | "body" | "bullet"; text: string };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function titleFor(s: ExportableScout): string {
  return s.forTeamName ? `${s.forTeamName} vs ${s.opponentName}` : `Scouting report: ${s.opponentName}`;
}

function blocksFor(s: ExportableScout): Block[] {
  const p = s.plan;
  const out: Block[] = [{ kind: "title", text: titleFor(s) }];
  const when = formatDate(s.matchTime) || formatDate(s.generatedAt);
  if (when) out.push({ kind: "body", text: when });
  if (p.headline) out.push({ kind: "lead", text: p.headline });
  if (p.summary) out.push({ kind: "body", text: p.summary });

  const calls = (heading: string, intro: string | undefined, keys: Call[] | undefined) => {
    if (!intro && !keys?.length) return;
    out.push({ kind: "heading", text: heading });
    if (intro) out.push({ kind: "body", text: intro });
    keys?.forEach((k) => out.push({ kind: "bullet", text: `${k.call}: ${k.why}` }));
  };

  if (p.howTheyPlay) out.push({ kind: "heading", text: "How they play" }, { kind: "body", text: p.howTheyPlay });
  calls("Defending them", p.defendingThem?.summary, p.defendingThem?.keys);
  calls("Attacking them", p.attackingThem?.summary, p.attackingThem?.keys);
  if (p.playersToStop?.length) {
    out.push({ kind: "heading", text: "Players to stop" });
    p.playersToStop.forEach((x) => out.push({ kind: "bullet", text: `${x.name}: ${x.threat} ${x.plan}` }));
  }
  if (p.lineupsAndRotation?.summary || p.lineupsAndRotation?.watchFor?.length) {
    out.push({ kind: "heading", text: "Lineups and rotation" });
    if (p.lineupsAndRotation.summary) out.push({ kind: "body", text: p.lineupsAndRotation.summary });
    p.lineupsAndRotation.watchFor?.forEach((w) => out.push({ kind: "bullet", text: w }));
  }
  if (p.lateGame) out.push({ kind: "heading", text: "Late game" }, { kind: "body", text: p.lateGame });
  if (p.gamePlan?.length) {
    out.push({ kind: "heading", text: "Game plan" });
    p.gamePlan.forEach((g, i) => out.push({ kind: "bullet", text: `${i + 1}. ${g.call}: ${g.why}` }));
  }
  return out;
}

export function scoutToText(s: ExportableScout): string {
  return blocksFor(s)
    .map((b) => (b.kind === "heading" ? `\n${b.text.toUpperCase()}` : b.kind === "bullet" ? `- ${b.text}` : b.text))
    .join("\n")
    .trim();
}

export function scoutFileName(s: ExportableScout): string {
  const base = s.forTeamName ? `${s.forTeamName}-vs-${s.opponentName}` : `scout-${s.opponentName}`;
  return `${base.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf`;
}

export function scoutToPdf(s: ExportableScout): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 18;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;

  const style = {
    title: { size: 20, bold: true, gap: 3, after: 3 },
    heading: { size: 12, bold: true, gap: 6, after: 1 },
    lead: { size: 13, bold: true, gap: 2, after: 2 },
    body: { size: 10.5, bold: false, gap: 0, after: 2 },
    bullet: { size: 10.5, bold: false, gap: 0, after: 1.5 },
  } as const;

  for (const b of blocksFor(s)) {
    const st = style[b.kind];
    const indent = b.kind === "bullet" ? 5 : 0;
    pdf.setFont("helvetica", st.bold ? "bold" : "normal");
    pdf.setFontSize(st.size);
    const lines: string[] = pdf.splitTextToSize(b.text, width - indent);
    const lineHeight = st.size * 0.42;
    y += st.gap;
    if (y + lineHeight > bottom) { pdf.addPage(); y = margin; }
    if (b.kind === "bullet") pdf.text("•", margin, y + lineHeight * 0.8);
    for (const line of lines) {
      if (y + lineHeight > bottom) { pdf.addPage(); y = margin; }
      pdf.text(line, margin + indent, y + lineHeight * 0.8);
      y += lineHeight;
    }
    y += st.after;
  }
  return pdf;
}

export async function downloadScout(s: ExportableScout): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  try {
    return await saveFile(scoutToPdf(s).output("blob"), scoutFileName(s));
  } catch (err) {
    console.error("Scout PDF download failed:", err);
    return "failed";
  }
}

/** Share sheet with the PDF where the device can send files, else the text; falls back to the clipboard. */
export async function shareScout(s: ExportableScout): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const title = titleFor(s);
  try {
    const file = new File([scoutToPdf(s).output("blob")], scoutFileName(s), { type: "application/pdf" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title, text: scoutToText(s) });
      return "shared";
    }
    await navigator.clipboard.writeText(scoutToText(s));
    return "copied";
  } catch (err) {
    return (err as Error)?.name === "AbortError" ? "cancelled" : "failed";
  }
}
