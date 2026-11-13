/**
 * The leagues on /british-basketball-history, shared with the History tab on
 * each league page so the two link to each other.
 */

export const SLB_BRAND_ID = "56cac2cb-6d34-459c-afa8-c34a8d4aa00f";
export const BCB_BRAND_ID = "fdf9aa2d-6685-4ad8-a558-811e96a741df";
export const NBL_BRAND_ID = "3b022087-839f-4329-aa5e-d39d9688139a";

export type HistoryLeague = { id: string; brandId: string; gender: string; name: string; short: string; lineage: string };

export const HISTORY_LEAGUES: HistoryLeague[] = [
  { id: "slb-men", brandId: SLB_BRAND_ID, gender: "Men", name: "Super League Basketball", short: "SLB", lineage: "Played as the British Basketball League (BBL) until 2024." },
  { id: "slb-women", brandId: SLB_BRAND_ID, gender: "Women", name: "Women's Super League Basketball", short: "SLB Women", lineage: "Played as the Women's British Basketball League (WBBL) until 2023." },
  { id: "bcb", brandId: BCB_BRAND_ID, gender: "", name: "British Championship Basketball", short: "BCB", lineage: "Played as NBL Division One until 2025." },
  { id: "nbl-men", brandId: NBL_BRAND_ID, gender: "Men", name: "NBL Division One", short: "NBL D1", lineage: "Played as NBL Division Two until 2025." },
  { id: "nbl-women", brandId: NBL_BRAND_ID, gender: "Women", name: "WNBL Division One", short: "WNBL D1", lineage: "The women's National Basketball League's Division One." },
];

/** The history page for one league brand (and gender), or null when the page doesn't cover it. */
export function historyPageHref(brandId: string, gender: string): string | null {
  const match = HISTORY_LEAGUES.find((l) => l.brandId === brandId && (l.gender || "") === (gender || ""));
  if (!match) return null;
  return match.id === HISTORY_LEAGUES[0].id ? "/british-basketball-history" : `/british-basketball-history?league=${match.id}`;
}
