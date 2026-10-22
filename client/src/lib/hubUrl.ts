/**
 * The Coaches Hub keeps what it is showing in React state, so a copied or
 * messaged link used to land on the default overview. These helpers put the
 * league, tab and open report into the query string and read them back, so a
 * link opens straight onto the report it was made from.
 *
 *   /coaches-hub?league=<id>&tab=scouting&view=scout&opponent=London%20Lions
 */

export const HUB_URL_TABS = ["overview", "compare", "rankings", "lineups", "trends", "scouting", "playbook"] as const;
export type HubUrlTab = (typeof HUB_URL_TABS)[number];

export type HubUrlView =
  | { type: "player"; teamId: string; name: string }
  | { type: "team"; teamId: string }
  | { type: "matchReport"; gameKey: string }
  | { type: "scoutReport"; opponentName: string; forTeamName?: string };

export interface HubUrlState {
  league?: string;
  tab?: HubUrlTab;
  view?: HubUrlView;
}

// Every query key the hub writes. Anything else in the URL is left alone.
const OWNED_KEYS = ["league", "tab", "view", "team", "player", "game", "opponent", "for"];

export function readHubUrl(search: string): HubUrlState | null {
  const params = new URLSearchParams(search);
  const state: HubUrlState = {};

  const league = params.get("league");
  if (league) state.league = league;

  const tab = params.get("tab");
  if (tab && (HUB_URL_TABS as readonly string[]).includes(tab)) state.tab = tab as HubUrlTab;

  const view = params.get("view");
  if (view === "player") {
    const teamId = params.get("team");
    const name = params.get("player");
    if (teamId && name) state.view = { type: "player", teamId, name };
  } else if (view === "team") {
    const teamId = params.get("team");
    if (teamId) state.view = { type: "team", teamId };
  } else if (view === "match") {
    const gameKey = params.get("game");
    if (gameKey) state.view = { type: "matchReport", gameKey };
  } else if (view === "scout") {
    const opponentName = params.get("opponent");
    const forTeamName = params.get("for");
    if (opponentName) state.view = forTeamName ? { type: "scoutReport", opponentName, forTeamName } : { type: "scoutReport", opponentName };
  }

  return state.league || state.tab || state.view ? state : null;
}

/** The query string (with leading "?", or "") for a hub state, keeping any keys the hub doesn't own. */
export function buildHubSearch(state: HubUrlState, currentSearch = ""): string {
  const params = new URLSearchParams(currentSearch);
  OWNED_KEYS.forEach((key) => params.delete(key));

  if (state.league) params.set("league", state.league);
  if (state.tab && state.tab !== "overview") params.set("tab", state.tab);

  const view = state.view;
  if (view?.type === "player") {
    params.set("view", "player");
    params.set("team", view.teamId);
    params.set("player", view.name);
  } else if (view?.type === "team") {
    params.set("view", "team");
    params.set("team", view.teamId);
  } else if (view?.type === "matchReport") {
    params.set("view", "match");
    params.set("game", view.gameKey);
  } else if (view?.type === "scoutReport") {
    params.set("view", "scout");
    params.set("opponent", view.opponentName);
    if (view.forTeamName) params.set("for", view.forTeamName);
  }

  const out = params.toString();
  return out ? `?${out}` : "";
}
