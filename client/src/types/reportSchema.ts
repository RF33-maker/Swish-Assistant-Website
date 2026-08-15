import { z } from "zod";

export const ScoutingReportSchema = z.object({
  meta: z.object({
    player: z.string(),
    team: z.string(),
    opponent: z.string().optional().nullable(),
    gameDate: z.string().optional().nullable(),
    position: z.string().optional().nullable(),
    age: z.number().optional().nullable(),
    height: z.string().optional().nullable(),
    weight: z.string().optional().nullable(),
    photoUrl: z.string().optional().nullable(),
  }),
  stats: z.object({
    ppg: z.number().nullable().optional(),
    rpg: z.number().nullable().optional(),
    apg: z.number().nullable().optional(),
    spg: z.number().nullable().optional(),
    bpg: z.number().nullable().optional(),
    fgPct: z.number().nullable().optional(), // 0–100
    tpPct: z.number().nullable().optional(),
    ftPct: z.number().nullable().optional(),
  }),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
});

export type ScoutingReport = z.infer<typeof ScoutingReportSchema>;