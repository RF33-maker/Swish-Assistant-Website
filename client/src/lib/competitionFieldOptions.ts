import { supabase } from "@/lib/supabase";

export interface CompetitionFieldOptions {
  organisations: string[];
  seasons: string[];
  divisions: string[];
  ageGroups: string[];
  genders: string[];
}

const EMPTY_OPTIONS: CompetitionFieldOptions = {
  organisations: [],
  seasons: [],
  divisions: [],
  ageGroups: [],
  genders: [],
};

let cached: Promise<CompetitionFieldOptions> | null = null;

function dedupeSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b)
  );
}

// Distinct values already in use across every competition, so the create/manage
// forms can surface them as suggestions instead of relying on free text — this is
// what catches "Basketball England" vs "basketball england" or "26-27" vs
// "2026-27" before they cause a duplicate league at ingestion time.
export async function fetchCompetitionFieldOptions(): Promise<CompetitionFieldOptions> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const { data, error } = await supabase
        .from("competitions")
        .select("organisation, season, division, age_group, gender");

      if (error || !data) {
        console.error("Error fetching competition field options:", error);
        return EMPTY_OPTIONS;
      }

      return {
        organisations: dedupeSorted(data.map((r: any) => r.organisation)),
        seasons: dedupeSorted(data.map((r: any) => r.season)),
        divisions: dedupeSorted(data.map((r: any) => r.division)),
        ageGroups: dedupeSorted(data.map((r: any) => r.age_group)),
        genders: dedupeSorted(data.map((r: any) => r.gender)),
      };
    } catch (err) {
      console.error("Error fetching competition field options:", err);
      return EMPTY_OPTIONS;
    }
  })();
  return cached;
}
