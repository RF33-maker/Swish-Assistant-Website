import { ScoutingReport } from "@/types/reportSchema";
import CleanProTemplate from "./CleanProTemplate";

export type ReportTemplate = {
  id: string;
  name: string;
  render: (data: ScoutingReport) => JSX.Element;
};

export const templates: ReportTemplate[] = [
  { 
    id: "clean-pro", 
    name: "Clean Pro", 
    render: (data: ScoutingReport) => CleanProTemplate({ data }) 
  },
];