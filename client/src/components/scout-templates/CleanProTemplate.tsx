import { ScoutingReport } from "@/types/reportSchema";

export default function CleanProTemplate({ data }: { data: ScoutingReport }) {
  const { meta, stats, strengths, weaknesses } = data;
  const Stat = ({ label, value }: {label: string; value: number | string | null | undefined}) => (
    <div className="text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );

  return (
    <div id="report-canvas" className="w-[900px] bg-white rounded-xl shadow-lg overflow-hidden border">
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase opacity-75">Report</div>
          <div className="text-xl font-bold">Basketball Scouting</div>
        </div>
        <div className="text-xs text-right opacity-80">
          <div>{meta.team}{meta.opponent ? ` vs ${meta.opponent}` : ""}</div>
          {meta.gameDate && <div>{meta.gameDate}</div>}
        </div>
      </div>

      <div className="grid grid-cols-[96px_1fr_auto] gap-4 p-6">
        <div className="h-24 w-24 rounded-full bg-slate-100 overflow-hidden">
          {meta.photoUrl ? <img src={meta.photoUrl} className="h-full w-full object-cover" /> : null}
        </div>

        <div>
          <div className="text-2xl font-bold">{meta.player}</div>
          <div className="text-sm text-slate-600">
            {meta.team} • {meta.position ?? "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {meta.age ? `Age ${meta.age}` : ""} {meta.height ? ` • ${meta.height}` : ""} {meta.weight ? ` • ${meta.weight}` : ""}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-4 items-end">
          <Stat label="PPG" value={stats.ppg} />
          <Stat label="RPG" value={stats.rpg} />
          <Stat label="APG" value={stats.apg} />
          <Stat label="SPG" value={stats.spg} />
          <Stat label="BPG" value={stats.bpg} />
          <Stat label="FG%" value={stats.fgPct != null ? `${stats.fgPct}%` : null} />
          <Stat label="3P%" value={stats.tpPct != null ? `${stats.tpPct}%` : null} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 px-6 pb-6">
        <div className="border rounded-lg p-4">
          <div className="font-semibold mb-2">Strengths</div>
          {strengths?.length ? (
            <ul className="text-sm space-y-1">{strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>
          ) : <div className="text-sm text-slate-500">No data.</div>}
        </div>
        <div className="border rounded-lg p-4">
          <div className="font-semibold mb-2">Weaknesses</div>
          {weaknesses?.length ? (
            <ul className="text-sm space-y-1">{weaknesses.map((w, i) => <li key={i}>• {w}</li>)}</ul>
          ) : <div className="text-sm text-slate-500">No data.</div>}
        </div>
      </div>

      <div className="bg-slate-50 text-[11px] text-slate-500 px-6 py-3 flex items-center justify-between border-t">
        <div>Swish Assistant • Professional Scouting</div>
        <div>share • print • export</div>
      </div>
    </div>
  );
}