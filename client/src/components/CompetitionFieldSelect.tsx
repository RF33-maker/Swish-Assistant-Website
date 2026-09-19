import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface CompetitionFieldSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  inputClassName?: string;
}

// A text input with a filterable dropdown of previously-used values.
// Picking a suggestion avoids re-typing a near-duplicate (e.g. "Basketball
// England" vs "basketball england", "26-27" vs "2026-27") that would
// otherwise cause the backend's fuzzy matching to miss and create a
// duplicate league — but typing a genuinely new value is still allowed,
// since this isn't a closed set (a new organisation/season is expected
// eventually).
export function CompetitionFieldSelect({
  value,
  onChange,
  options,
  placeholder,
  inputClassName,
}: CompetitionFieldSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((o) =>
    value.trim() ? o.toLowerCase().includes(value.trim().toLowerCase()) : true
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={inputClassName}
        />
        {options.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setOpen(!open)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg divide-y divide-gray-100">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${
                option === value ? "font-semibold text-orange-700" : "text-gray-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
