// Swish Assistant Logo Component
export interface SwishLogoProps {
  className?: string;
  size?: number;
}

export function SwishLogo({ className = "", size = 16 }: SwishLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Basketball with swoosh motion lines */}
      <circle 
        cx="12" 
        cy="12" 
        r="6" 
        fill="currentColor" 
        opacity="0.9"
      />
      {/* Basketball lines */}
      <path 
        d="M6 12 Q12 8 18 12" 
        stroke="white" 
        strokeWidth="0.8" 
        fill="none"
        opacity="0.8"
      />
      <path 
        d="M6 12 Q12 16 18 12" 
        stroke="white" 
        strokeWidth="0.8" 
        fill="none"
        opacity="0.8"
      />
      <line 
        x1="12" 
        y1="6" 
        x2="12" 
        y2="18" 
        stroke="white" 
        strokeWidth="0.8"
        opacity="0.8"
      />
      {/* Swish motion lines */}
      <path 
        d="M2 8 Q6 6 8 8" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        fill="none"
        opacity="0.6"
      />
      <path 
        d="M3 16 Q7 14 9 16" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        fill="none"
        opacity="0.4"
      />
      <path 
        d="M16 8 Q20 6 22 8" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}