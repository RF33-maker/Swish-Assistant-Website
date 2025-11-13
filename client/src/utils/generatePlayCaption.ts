export function generatePlayCaption(play: any): string {
  const player = play.player_name || "Unknown Player";
  const action = play.action_type;
  const sub = play.sub_type || "";
  const qualifiers: string[] = play.qualifiers || [];
  const score = play.score || "";
  
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
  };

  if (!action) return "";

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
  if (action === "rebound") {
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
  if (action === "freethrow") {
    return `${player} sinks it from the line. 🎯`;
  }

  // Assists
  if (action === "assist") {
    return `${player} threads the needle for the dime. 🧠`;
  }

  // Fouls
  if (action === "foul") {
    if (sub) {
      return `${sub} foul on ${player}. 🚫`;
    }
    return `Foul on ${player}. 🚫`;
  }

  // Turnovers
  if (action === "turnover") {
    return `${player} turns it over — going the other way! ⚡`;
  }

  // Steals
  if (action === "steal") {
    return `${player} picks his pocket! 🔒`;
  }

  // Blocks
  if (action === "block") {
    return `${player} denies it at the rim! ⛔`;
  }

  // Default fallback
  return `${player} ${action} ${sub ? sub : ""}`.trim();
}
