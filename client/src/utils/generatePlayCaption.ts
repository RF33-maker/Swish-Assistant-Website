export function generatePlayCaption(play: any): string {
  const action = play.action_type?.toLowerCase() || "";
  const sub = play.sub_type || "";
  const qualifiers: string[] = play.qualifiers || [];
  const score = play.score || "";
  const period = play.period;
  const player = play.player_name?.trim();
  
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
    // Period starts - just show "Start"
    if (action.includes("start") || action.includes("begin")) {
      return `Start`;
    }

    // Period ends
    if (action.includes("end")) {
      return `End of quarter`;
    }

    // Timeouts
    if (action.includes("timeout") || action.includes("time out")) {
      return `Timeout 🕐`;
    }

    // Jump ball - just show "Jump ball"
    if (action.includes("jumpball") || action.includes("jump ball") || action === "jump") {
      return `Jump ball`;
    }

    // Team rebounds
    if (action.includes("teamreb") || action.includes("team rebound")) {
      return `Team rebound 💪`;
    }

    // Generic system event
    if (sub) {
      return `${sub}`;
    }
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  // Player-based events
  // Shot events - 2pt and 3pt
  if (["2pt", "3pt"].includes(action)) {
    const shotWord = sub || "jumper";
    const emoji = emojis[action];
    
    if (qualifiers.includes("fastbreak")) {
      return `${player} finishes the fast break with a ${shotWord}! ${emoji}`;
    }
    if (qualifiers.includes("pointsinthepaint")) {
      return `${player} scores inside with a ${shotWord}. ${emoji}`;
    }
    if (sub.toLowerCase().includes("layup")) {
      return `${player} finishes with the ${shotWord}! ${emoji}`;
    }
    if (sub.toLowerCase().includes("dunk")) {
      return `${player} throws it down with authority! ${emoji}`;
    }
    if (action === "3pt") {
      return `${player} drills the three-pointer! ${emoji} ${score ? `(${score})` : ""}`;
    }
    return `${player} hits the ${shotWord}! ${emoji} ${score ? `(${score})` : ""}`;
  }

  // Rebounds
  if (action.includes("rebound")) {
    if (sub.toLowerCase().includes("defensive")) {
      return `${player} cleans the glass with the defensive rebound. 💪`;
    }
    if (sub.toLowerCase().includes("offensive")) {
      return `${player} crashes the boards for the offensive rebound! 💪`;
    }
    const type = sub ? `${sub} rebound` : "rebound";
    return `${player} secures the ${type}. 💪`;
  }

  // Free throws
  if (action.includes("freethrow") || action.includes("free throw")) {
    return `${player} sinks it from the line. 🎯`;
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
