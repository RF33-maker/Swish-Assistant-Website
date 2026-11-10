import { useEffect, useRef, useState } from "react";

/**
 * Faint words in the aurora while Ask is working: "rebounds", "standings",
 * "hopkins", drifting up through the light the way the curtains drift, as if
 * the lights were forming letters. Not a loading indicator (the conversation
 * has its own); just the backdrop hinting at what's being looked at.
 *
 * Only while the aurora surges (`active`), one or two at a time with gaps,
 * each fading in and out over a few seconds. When the answer lands they fade
 * with the light. Words come first from the server's live steps ("Looking up
 * Justin Hopkins…" → "hopkins"), then from the question, then general ones.
 * Nothing at all under reduced motion.
 *
 * Placed where the light is brightest (the curtains' bodies, a little above
 * the middle and lower on the right, following their tilt), but only in the
 * open space between the end of the conversation and the input bar (`room`),
 * so a word never sits behind text. No room, no word. */

const GENERIC = ["calculating", "searching", "counting", "box scores", "possessions", "splits", "sorting", "the numbers"];

const STAT_WORDS: [RegExp, string][] = [
  [/\b(points?|pts|scor\w*)\b/i, "points"],
  [/\b(rebounds?|reb|boards)\b/i, "rebounds"],
  [/\b(assists?|ast)\b/i, "assists"],
  [/\b(steals?|stl)\b/i, "steals"],
  [/\b(blocks?|blk)\b/i, "blocks"],
  [/\b(threes?|3pt|3pm|3-?pointers?|three-?pointers?)\b/i, "threes"],
  [/\b(turnovers?|tov)\b/i, "turnovers"],
  [/\b(rim|paint)\b/i, "at the rim"],
  [/\b(shoot\w*|fg%|percentages?|efficien\w*)\b/i, "shooting"],
  [/\b(free throws?|ft%)\b/i, "free throws"],
  [/\blineups?\b/i, "lineups"],
  [/(on\/off|on-off|\bimpact\b|plus-?minus)/i, "on / off"],
  [/\b(standings?|table|ladder)\b/i, "standings"],
  [/\b(fixtures?|schedule|upcoming)\b/i, "fixtures"],
  [/\b(season highs?|career highs?|records?)\b/i, "season highs"],
  [/\bplay-by-play\b/i, "play-by-play"],
  [/\bshot (locations?|zones?|chart|map)\b/i, "shot zones"],
  [/\b(compar\w*|versus|vs\.?)\b/i, "comparing"],
  [/\b(leaders?|best|top|most|ranking)\b/i, "leaders"],
  [/\bminutes\b/i, "minutes"],
  [/\b(defen[cs]e|defensive)\b/i, "defence"],
  [/\bopening the game\b/i, "box score"],
];

/** The words a line suggests: its stats, and the surnames of anyone the server looked up. */
function wordsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = STAT_WORDS.filter(([re]) => re.test(text)).map(([, w]) => w);
  const names = [
    ...Array.from(text.matchAll(/^Looking up (.+?)…?$/g), (m) => m[1]),
    ...Array.from(text.matchAll(/^Comparing (.+?) and (.+?)…?$/g), (m) => [m[1], m[2]]).flat(),
  ];
  for (const n of names) {
    const surname = n.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z'-]/g, "");
    if (surname && surname.length > 2) out.push(surname);
  }
  return out;
}

interface Word {
  id: number;
  text: string;
  x: number;
  y: number;
  dx: number;
  peak: number;
  size: number;
}

const LIFE_MS = 7000;

/** The free strip of screen, top and bottom in viewport pixels. */
export type AuroraRoom = () => { top: number; bottom: number } | null;

export default function AuroraWords({ active, question, status, room }: { active: boolean; question?: string | null; status?: string | null; room?: AuroraRoom }) {
  const [words, setWords] = useState<Word[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  // Words not shown yet from the live steps go first; the recent ones aren't repeated.
  const fresh = useRef<string[]>([]);
  const recent = useRef<string[]>([]);
  const fromQuestion = useRef<string[]>([]);
  const lowerBand = useRef(false);
  const side = useRef(Math.random() < 0.5 ? -1 : 1);
  const nextId = useRef(0);
  const roomRef = useRef(room);
  roomRef.current = room;

  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    fromQuestion.current = wordsIn(question);
    fresh.current = [];
    recent.current = [];
  }, [question]);

  useEffect(() => {
    for (const w of wordsIn(status)) if (!fresh.current.includes(w) && !recent.current.includes(w)) fresh.current.push(w);
  }, [status]);

  useEffect(() => {
    if (!active || reduced) return;
    setWords([]);
    let timer = 0;

    const pick = () => {
      const unused = (list: string[]) => list.filter((w) => !recent.current.includes(w));
      const pool = fresh.current.length ? [fresh.current.shift()!] : unused(fromQuestion.current).length ? unused(fromQuestion.current) : unused(GENERIC);
      const word = pool[Math.floor(Math.random() * pool.length)] ?? GENERIC[0];
      recent.current = [word, ...recent.current].slice(0, 3);
      return word;
    };

    const spawn = () => {
      const box = ref.current?.getBoundingClientRect();
      if (box && box.width > 0) {
        const s = Math.min(box.width, box.height);
        const size = Math.round(Math.min(56, Math.max(30, s * 0.085)));
        // The open strip, in this layer's coordinates, kept clear of the text by a margin.
        const open = roomRef.current?.() ?? null;
        const lo = (open ? open.top - box.top : 0) + 24 + size * 0.6;
        const hi = (open ? open.bottom - box.top : box.height) - 24 - size * 0.6;
        if (hi > lo) {
          // Left and right in turn, upper and lower in turn, so two never meet.
          side.current = -side.current;
          lowerBand.current = !lowerBand.current;
          const reach = Math.min(0.45, (box.width / s) * 0.3);
          const px = side.current * (0.1 + Math.random() * (reach - 0.1));
          const band = lowerBand.current ? 0.18 + Math.random() * 0.08 : 0.28 + Math.random() * 0.08;
          const y = box.height / 2 - (band - 0.16 * px) * s;
          const word: Word = {
            id: nextId.current++,
            text: pick(),
            x: box.width / 2 + px * s,
            y: Math.min(hi, Math.max(lo, y)),
            dx: (Math.random() - 0.5) * 40,
            peak: 0.16 + Math.random() * 0.08,
            size,
          };
          setWords((ws) => [...ws.slice(-1), word]);
          window.setTimeout(() => setWords((ws) => ws.filter((w) => w.id !== word.id)), LIFE_MS + 200);
        }
      }
      timer = window.setTimeout(spawn, 3200 + Math.random() * 1800);
    };
    // Let the light build first.
    timer = window.setTimeout(spawn, 1400);
    return () => window.clearTimeout(timer);
  }, [active, reduced]);

  if (reduced) return null;

  return (
    <div ref={ref} aria-hidden="true" className={`aurora-words pointer-events-none absolute inset-0 overflow-hidden ${active ? "" : "is-calming"}`}>
      {words.map((w) => (
        <span
          key={w.id}
          className="aurora-word"
          style={{
            left: w.x,
            top: w.y,
            fontSize: w.size,
            ["--aw-dx" as string]: `${w.dx}px`,
            ["--aw-peak" as string]: w.peak,
            animationDuration: `${LIFE_MS}ms`,
          }}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}
