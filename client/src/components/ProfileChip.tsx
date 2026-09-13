interface ProfileChipProps {
  label: string;
  onClick: () => void;
  variant?: 'light' | 'onColor';
}

export function ProfileChip({ label, onClick, variant = 'onColor' }: ProfileChipProps) {
  const className =
    variant === 'onColor'
      ? "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm transition-colors"
      : "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 hover:bg-white text-slate-700 dark:text-slate-300 backdrop-blur-sm transition-colors";

  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}
