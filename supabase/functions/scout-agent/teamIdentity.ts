// Copied from server/teamIdentityService.ts (isSameTeam and its helpers). Keep in step.
function identityKey(name: string): string {
  const normalized = (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+Senior\s+(Men|Women)\s*/gi, " ")
    .replace(/!/g, "")
    .replace(/^#+/, "")
    .replace(/\s+I(?![IVX])\s*$/i, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  const aliases: Record<string, string> = {
    mkbreakers: "miltonkeynesbreakers",
    bath: "bathbasketball",
    diawysctempo: "diawysc",
  };
  return aliases[normalized] || normalized;
}
function teamLevel(name: string): string {
  const value = (name || "").toLowerCase();
  const age = value.match(/\b(u(?:nder)?\s*\d{2}|\d{2}u)\b/)?.[0]?.replace(/\s+/g, "") || "";
  const reserve = value.match(/\b(ii|iii|iv|2|3|reserves?|development)\b/)?.[0] || "";
  const gender = value.match(/\b(women|women's|ladies|men|men's)\b/)?.[0] || "";
  return `${age}|${reserve}|${gender}`;
}
export function isSameTeam(a: string, b: string): boolean {
  const level = (name: string) => teamLevel((name || "").replace(/\s+Senior\s+Men\b/gi, " "));
  return identityKey(a) === identityKey(b) && level(a) === level(b);
}
