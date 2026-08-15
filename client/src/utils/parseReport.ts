import { ScoutingReportSchema, ScoutingReport } from "@/types/reportSchema";

export function safelyParseReport(maybeJson: string): ScoutingReport | null {
  try {
    const cleaned = maybeJson.trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "");
    const obj = JSON.parse(cleaned);
    const parsed = ScoutingReportSchema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}