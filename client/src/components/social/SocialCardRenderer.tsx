import { PlayerPerformanceCardV1 } from "./PlayerPerformanceCardV1";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";

type Props = {
  template: string;
  data: any;
};

export function SocialCardRenderer({ template, data }: Props) {
  switch (template) {
    case "player_performance_v1":
      return <PlayerPerformanceCardV1 data={data as PlayerPerformanceV1Data} />;
    default:
      return (
        <div className="w-[1080px] h-[1350px] bg-gray-800 flex items-center justify-center text-white text-2xl">
          Unknown template: {template}
        </div>
      );
  }
}
