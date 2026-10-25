const paths = {
  chevrons: <path d="m8 9 4-4 4 4m-8 6 4 4 4-4" />,
  card: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8m-8 4h6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  checklist: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="m6 12 2 2 3-4m3 1h4m-4 5h4" />
    </>
  ),
  edit: <path d="m15 4 5 5-10 10-6 1 1-6zM13 6l5 5" />,
  bold: <path d="M7 4h6a4 4 0 0 1 0 8H7m0-8v16h7a4 4 0 0 0 0-8H7" />,
  italic: <path d="M10 4h9M5 20h9M15 4 9 20" />,
  strike: <path d="M17 6c-1-3-10-3-10 2 0 2 3 3 5 4m-5 5c1 4 10 4 10-1M3 12h18" />,
  bullets: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4" cy="6" r=".7" />
      <circle cx="4" cy="12" r=".7" />
      <circle cx="4" cy="18" r=".7" />
    </>
  ),
  numbers: <path d="M10 6h11M10 12h11M10 18h11M3 4h1v5M2 9h4M2 14c0-3 5-3 4 0l-4 5h4" />,
  quote: <path d="M4 6h6v7H5c0 3 1 4 3 5M14 6h6v7h-5c0 3 1 4 3 5" />,
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />,
  codeblock: (
    <>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <path d="m9 8-4 4 4 4m6-8 4 4-4 4" />
    </>
  ),
  link: (
    <path
      d="m10 13 4-4m-7 6-1 1a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6m1-3 1-1a4 4 0 0 0-6-6L8 6a4 4 0 0 0 0 6"
      transform="translate(1 -1) scale(.9)"
    />
  ),
  minus: <path d="M4 12h16" />,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {paths[name]}
    </svg>
  );
}
