import { useId } from "react";

/** The QisPlay mark: a Bloch sphere with a state vector (same art as public/logo.svg). */
export function Logo({ size = 28 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradient})`} />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M13 32a19 6.5 0 0 1 38 0" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeDasharray="3 3" />
      <path d="M13 32a19 6.5 0 0 0 38 0" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2" />
      <path d="M32 32 43.5 18.5" stroke="#5eead4" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="44" cy="18" r="4.5" fill="#5eead4" />
      <circle cx="32" cy="32" r="2.5" fill="#fff" />
    </svg>
  );
}
