import { useState } from "react";
import { Users } from "lucide-react";

export function PlayerSearchAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [imgError, setImgError] = useState(false);

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover flex-shrink-0 border border-orange-200 dark:border-neutral-600"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
      <Users className="h-4 w-4 text-white" />
    </div>
  );
}
