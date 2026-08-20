/**
 * Hand-rolled 20px stroke icons.
 *
 * Direction-bearing glyphs are named by *meaning* (Prev / Next) rather than by
 * geometry, and their arrows already point the RTL way: in a right-to-left
 * document "previous" moves the eye to the right and "next" to the left.
 */

type IconProps = { className?: string };

function Svg({ className = 'size-4', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Previous month — points right, the "back" direction in RTL. */
export const PrevIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4l6 6-6 6" />
  </Svg>
);

/** Next month — points left, the "forward" direction in RTL. */
export const NextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4l-6 6 6 6" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Svg>
);

export const PrintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8V3.5h8V8" />
    <path d="M6 14H4.5A1.5 1.5 0 013 12.5v-3A1.5 1.5 0 014.5 8h11A1.5 1.5 0 0117 9.5v3a1.5 1.5 0 01-1.5 1.5H14" />
    <path d="M6 12h8v4.5H6z" />
  </Svg>
);

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.2 3.8a1.7 1.7 0 012.4 2.4L7.5 14.3l-3.2.9.9-3.2z" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5" />
    <path d="M5.5 5.5l.7 9.2a1.5 1.5 0 001.5 1.3h4.6a1.5 1.5 0 001.5-1.3l.7-9.2" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 7v4M10 13.6v.2" />
    <path d="M8.7 3.6L2.6 14.2A1.5 1.5 0 003.9 16.5h12.2a1.5 1.5 0 001.3-2.3L11.3 3.6a1.5 1.5 0 00-2.6 0z" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.5" cy="7" r="2.6" />
    <path d="M2.8 16c.4-2.6 2.3-4.1 4.7-4.1S11.8 13.4 12.2 16" />
    <path d="M13 5.1a2.4 2.4 0 010 4.6M14.4 11.9c1.7.4 2.7 1.8 3 4.1" />
  </Svg>
);

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12.5h3v4h-3zM8.5 7h3v9.5h-3zM13.5 3.5h3v13h-3z" />
  </Svg>
);

export const ReportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.8h6.5L15 6.3v10.9H5z" />
    <path d="M11 2.8v3.8h3.8M7.5 10.5h5M7.5 13.5h5" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 6V4.2a1.2 1.2 0 00-1.2-1.2H4.7a1.2 1.2 0 00-1.2 1.2v11.6A1.2 1.2 0 004.7 17h6.6a1.2 1.2 0 001.2-1.2V14" />
    <path d="M16.5 10H7.8M14 7.5L16.5 10 14 12.5" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Svg>
);

export const InvoiceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 3.2h11v13.6l-2-1.2-1.8 1.2-1.7-1.2-1.8 1.2-1.7-1.2-2 1.2z" />
    <path d="M7.5 7.5h5M7.5 10.5h5" />
  </Svg>
);

/** Small brand mark: a stylised building silhouette. */
export function BrandMark({ className = 'size-8' }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="var(--color-brand-900)" />
      <path
        d="M9 22.5V12.4l5.2-3.1 5.2 3.1v10.1"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M12.4 22.5v-3.6h3.7v3.6" stroke="white" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      <path d="M21.4 22.5V15l2.6 1.5v6" stroke="var(--color-brand-200)" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
