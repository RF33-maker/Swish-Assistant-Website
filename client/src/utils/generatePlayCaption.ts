// Feed codes that read badly as-is in team-level captions.
const TEAM_PLAY_WORDS: Record<string, string> = {
  "24sec": "shot clock",
  "8sec": "8 seconds",
  "5sec": "5 seconds",
  "3sec": "3 seconds",
  outofbounds: "out of bounds",
  ballhandling: "ball handling",
  badpass: "bad pass",
  heldball: "held ball",
  headcoachchallenge: "coach's challenge",
};

export function generatePlayCaption(play: any, previousPlay?: any): string {
  const rawAction = play.action_type?.toLowerCase() || "";
  const sub = play.sub_type || "";
  const qualifiers: string[] = play.qualifiers || [];
  const score = play.score || "";
  const period = play.period;
  const player = play.player_name?.trim();
  
  // Normalize action type to standard format
  let action = rawAction;
  if (rawAction.includes("three") || rawAction.includes("3pt") || rawAction.includes("3-pt") || play.points === 3) {
    action = "3pt";
  } else if (rawAction.includes("field") || rawAction.includes("shot") || rawAction.includes("layup") || 
             rawAction.includes("dunk") || rawAction.includes("jumper") || rawAction.includes("2pt") || 
             rawAction.includes("2-pt") || (play.points === 2 && !rawAction.includes("free"))) {
    action = "2pt";
  } else if (rawAction.includes("free") || rawAction.includes("ft")) {
    action = "freethrow";
  } else {
    action = rawAction;
  }
  
  // Derive make/miss from score change as fallback
  // If score changed from previous event, it's a make; otherwise it's a miss
  let derivedSuccess: boolean | null = null;
  if (previousPlay && score && previousPlay.score) {
    // Normalize scores by trimming whitespace for accurate comparison
    const currentScore = score.trim();
    const previousScore = previousPlay.score.trim();
    derivedSuccess = currentScore !== previousScore;
  }
  
  const emojis: Record<string, string> = {
    "2pt": "🏀",
    "3pt": "🎯",
    "rebound": "💪",
    "freethrow": "🎯",
    "assist": "🧠",
    "foul": "🚫",
    "turnover": "⚡",
    "steal": "🔒",
    "block": "⛔",
    "timeout": "🕐",
    "period": "🏀",
    "jumpball": "🏀",
  };

  if (!action) return "";

  // System events (no player involved)
  const systemEvents = [
    "period_start", "periodstart", "period start", "start",
    "period_end", "periodend", "period end", "end",
    "timeout", "time out",
    "jumpball", "jump ball",
    "game_start", "gamestart", "game start",
    "game_end", "gameend", "game end",
    "teamrebound", "team rebound", "teamreb"
  ];

  const isSystemEvent = systemEvents.some(evt => action.includes(evt)) || !player;

  if (isSystemEvent) {
    // FIBA feeds send period/game markers as action "period" or "game" with the start/end in sub_type.
    const subLower = sub.toLowerCase();
    const isMarker = action === "period" || action === "game";

    // Period starts
    if (action.includes("start") || action.includes("begin") || (isMarker && subLower === "start")) {
      const quarterNames = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
      const periodName = period && period <= 4 ? quarterNames[period - 1] : `Period ${period || ""}`;
      return `Start of ${periodName} 🏀`;
    }

    // Period ends
    if (action.includes("end") || (isMarker && subLower === "end")) {
      const quarterNames = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
      const periodName = period && period <= 4 ? quarterNames[period - 1] : `Period ${period || ""}`;
      return `End of ${periodName}`;
    }

    // Timeouts
    if (action.includes("timeout") || action.includes("time out")) {
      return `Timeout called 🕐`;
    }

    // Jump ball
    if (action.includes("jumpball") || action.includes("jump ball") || action === "jump") {
      return `Jump ball 🏀`;
    }

    // Team rebounds
    if (action.includes("teamreb") || action.includes("team rebound")) {
      return `Team rebound 💪`;
    }

    // Team plays with no player credited
    const detail = TEAM_PLAY_WORDS[subLower] ?? subLower;
    if (action === "rebound") return `Team ${detail ? `${detail} ` : ""}rebound 💪`;
    if (action === "turnover") return `Team turnover${detail ? ` (${detail})` : ""} ⚡`;
    if (action === "foul") return `Team foul${detail ? ` (${detail})` : ""} 🚫`;
    const shotWord = action === "2pt" ? "2-pointer" : action === "3pt" ? "3-pointer" : action === "freethrow" ? "free throw" : null;
    if (shotWord) return derivedSuccess === null ? `${shotWord.charAt(0).toUpperCase()}${shotWord.slice(1)}` : `${derivedSuccess ? "Made" : "Missed"} ${shotWord}`;

    // Generic system event
    const actionLabel = TEAM_PLAY_WORDS[action] ?? action;
    const capitalised = actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1);
    return detail ? `${capitalised} (${detail})` : capitalised;
  }

  // Player-based events
  // Shot events - 2pt and 3pt
  if (["2pt", "3pt"].includes(action)) {
    const shotWord = sub || "jumper";
    const subLower = sub.toLowerCase();
    const emoji = emojis[action];
    
    // Determine make/miss with fallback hierarchy:
    // 1. Derived from score change (most reliable)
    // 2. Check if points > 0 (heuristic)
    // 3. Check qualifiers for "made" or similar
    // 4. Fall back to success/scoring fields (least reliable)
    let isMake: boolean;
    if (derivedSuccess !== null) {
      isMake = derivedSuccess;
    } else if (play.points && play.points > 0) {
      isMake = true;
    } else if (qualifiers.some(q => q.toLowerCase().includes('made'))) {
      isMake = true;
    } else {
      isMake = play.success === true || play.scoring === true;
    }
    
    // Check for blocked shots
    const isBlocked = qualifiers.some(q => 
      q.toLowerCase().includes("block") || q.toLowerCase().includes("goaltend")
    );
    
    // Missed shots
    if (!isMake) {
      if (isBlocked) {
        return `${player}'s shot is blocked! ⛔`;
      }
      if (subLower.includes("dunk")) {
        return `${player} misses the dunk attempt! ${emoji}`;
      }
      if (subLower.includes("layup")) {
        return `${player} can't finish the ${shotWord}. ${emoji}`;
      }
      if (action === "3pt") {
        return `${player} misses the three-pointer. ${emoji}`;
      }
      if (qualifiers.some(q => q.toLowerCase().includes("fastbreak"))) {
        return `${player} misses on the fast break. ${emoji}`;
      }
      return `${player} misses the ${shotWord}. ${emoji}`;
    }
    
    // Made shots
    if (qualifiers.some(q => q.toLowerCase().includes("fastbreak"))) {
      return `${player} finishes the fast break with a ${shotWord}! ${emoji}`;
    }
    if (qualifiers.some(q => q.toLowerCase().includes("paint"))) {
      return `${player} scores inside with a ${shotWord}. ${emoji}`;
    }
    if (subLower.includes("layup")) {
      return `${player} finishes with the ${shotWord}! ${emoji}`;
    }
    if (subLower.includes("dunk")) {
      return `${player} throws it down with authority! ${emoji}`;
    }
    if (action === "3pt") {
      return `${player} drills the three-pointer! ${emoji} ${score ? `(${score})` : ""}`;
    }
    return `${player} hits the ${shotWord}! ${emoji} ${score ? `(${score})` : ""}`;
  }

  // Rebounds
  if (action.includes("rebound")) {
    const subLower = sub.toLowerCase();
    if (subLower.includes("defensive")) {
      return `${player} cleans the glass with the defensive rebound. 💪`;
    }
    if (subLower.includes("offensive")) {
      return `${player} crashes the boards for the offensive rebound! 💪`;
    }
    const type = sub ? `${sub} rebound` : "rebound";
    return `${player} secures the ${type}. 💪`;
  }

  // Free throws
  if (action.includes("freethrow") || action.includes("free throw")) {
    // Determine make/miss with fallback hierarchy (same as shots)
    let isMake: boolean;
    if (derivedSuccess !== null) {
      isMake = derivedSuccess;
    } else if (play.points && play.points > 0) {
      isMake = true;
    } else if (qualifiers.some(q => q.toLowerCase().includes('made'))) {
      isMake = true;
    } else {
      isMake = play.success === true || play.scoring === true;
    }
    
    if (isMake) {
      return `${player} sinks it from the line. 🎯`;
    } else {
      return `${player} misses the free throw. 🎯`;
    }
  }

  // Assists
  if (action.includes("assist")) {
    return `${player} threads the needle for the dime. 🧠`;
  }

  // Fouls
  if (action.includes("foul")) {
    if (sub) {
      return `${sub} foul on ${player}. 🚫`;
    }
    return `Foul on ${player}. 🚫`;
  }

  // Turnovers
  if (action.includes("turnover")) {
    return `${player} turns it over — going the other way! ⚡`;
  }

  // Steals
  if (action.includes("steal")) {
    return `${player} picks his pocket! 🔒`;
  }

  // Blocks
  if (action.includes("block")) {
    return `${player} denies it at the rim! ⛔`;
  }

  // Default fallback with player
  if (player) {
    return `${player} ${action} ${sub ? sub : ""}`.trim();
  }
  
  // Fallback for unknown events
  return sub || action.charAt(0).toUpperCase() + action.slice(1);
}
