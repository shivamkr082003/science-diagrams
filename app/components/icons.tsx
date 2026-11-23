// Small inline icons (no icon library needed). All use currentColor.
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const CheckIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const XIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const RefreshIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

export const ExpandIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

export const SparkIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);

export const ShieldIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const RetryIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16M3 21v-5h5" />
  </svg>
);

export const UserCheckIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 11l2 2 4-4" />
  </svg>
);

export const LogoMark = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="8" fill="#4f46e5" />
    <circle cx="16" cy="16" r="2.6" fill="#fff" />
    <ellipse cx="16" cy="16" rx="10" ry="4.2" fill="none" stroke="#fff" strokeWidth="1.6" />
    <ellipse cx="16" cy="16" rx="10" ry="4.2" fill="none" stroke="#c7d2fe" strokeWidth="1.6" transform="rotate(60 16 16)" />
    <ellipse cx="16" cy="16" rx="10" ry="4.2" fill="none" stroke="#c7d2fe" strokeWidth="1.6" transform="rotate(120 16 16)" />
  </svg>
);
