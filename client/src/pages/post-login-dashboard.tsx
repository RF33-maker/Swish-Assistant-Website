import { useLocation } from "wouter"

export default function DashboardLanding() {
  const [, navigate] = useLocation();

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-orange-600 font-semibold text-sm uppercase tracking-wide">
          Swish Assistant
        </h2>
        <p className="mt-2 text-center text-4xl sm:text-5xl font-extrabold text-slate-900">
          Choose your mode
        </p>

        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* League Admin Card */}
          <div
            onClick={() => navigate("/league-admin")}
            className="cursor-pointer bg-orange-50 border border-orange-200 rounded-xl shadow hover:shadow-lg transition p-8 flex flex-col items-center text-center"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/2554/2554976.png"
              alt="League Admin"
              className="w-20 h-20 mb-4"
            />
            <h3 className="text-xl font-semibold text-orange-700">League Admin</h3>
            <p className="text-slate-600 mt-2 text-sm max-w-xs">
              Upload stats, manage teams, and power your league with Swish Assistant tools.
            </p>
          </div>

          {/* Coaches Hub Card */}
          <div
            onClick={() => navigate("/coaches-hub")}
            className="cursor-pointer bg-white border border-gray-200 rounded-xl shadow hover:shadow-lg transition p-8 flex flex-col items-center text-center"
          >
            <img
              src="https://cdn-icons-png.flaticon.com/512/1128/1128613.png"
              alt="Coaches Hub"
              className="w-20 h-20 mb-4"
            />
            <h3 className="text-xl font-semibold text-slate-800">Coaches Hub</h3>
            <p className="text-slate-600 mt-2 text-sm max-w-xs">
              Build scouting reports, analyze player performance, and generate summaries with AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
