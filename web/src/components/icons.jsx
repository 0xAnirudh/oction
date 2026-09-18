// One icon system: a 16-unit grid, 1.5 stroke, round caps and joins,
// no fills except where a state is explicitly "on". Drawn here rather
// than pulled from a library so the weight matches the hairline rules
// the rest of the page is built from - a 2px icon set next to a 1px
// rule reads as two designs.

function Icon({ children, size = 16, fill = 'none', className = '', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BookmarkIcon = ({ on = false, ...p }) => (
  <Icon fill={on ? 'currentColor' : 'none'} {...p}>
    <path d="M3.5 2.5h9v11l-4.5-3.2-4.5 3.2v-11Z" />
  </Icon>
);

export const FlagIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 14V2.5" />
    <path d="M3.5 3h7.2l-1.1 2.4L10.7 8H3.5" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="M3 8.4l3.2 3.1L13 4.5" />
  </Icon>
);

export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 4.8V8l2.2 1.4" />
  </Icon>
);

export const GavelIcon = (p) => (
  <Icon {...p}>
    <path d="M2.4 13.6h6" />
    <path d="M6.6 2.9l4.2 4.2" />
    <path d="M9.1 1.9L12.9 5.7" />
    <path d="M8.9 5.3l-4.4 4.4a1.3 1.3 0 0 0 0 1.9l.1.1a1.3 1.3 0 0 0 1.9 0l4.4-4.4" />
  </Icon>
);

export const ShieldIcon = (p) => (
  <Icon {...p}>
    <path d="M8 1.9l4.8 1.8v4c0 3-2 5.3-4.8 6.4-2.8-1.1-4.8-3.4-4.8-6.4v-4L8 1.9Z" />
  </Icon>
);

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="7.2" cy="7.2" r="4.4" />
    <path d="M10.6 10.6L13.6 13.6" />
  </Icon>
);

export const ArrowIcon = (p) => (
  <Icon {...p}>
    <path d="M2.8 8h10" />
    <path d="M9 4.2L12.8 8 9 11.8" />
  </Icon>
);

export const AlertIcon = (p) => (
  <Icon {...p}>
    <path d="M8 2.6l5.8 10.1H2.2L8 2.6Z" />
    <path d="M8 6.6v3" />
    <path d="M8 11.5h.01" />
  </Icon>
);

export const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M1.4 8S4 3.6 8 3.6 14.6 8 14.6 8 12 12.4 8 12.4 1.4 8 1.4 8Z" />
    <circle cx="8" cy="8" r="1.9" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M2.8 4.2h10.4" />
    <path d="M6.4 4.2V2.9h3.2v1.3" />
    <path d="M4.2 4.2l.6 8.5a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.5" />
  </Icon>
);

export const DeviceIcon = (p) => (
  <Icon {...p}>
    <rect x="2.2" y="3" width="11.6" height="7.6" rx="1" />
    <path d="M1 13h14" />
  </Icon>
);

export const ChevronIcon = ({ dir = 'down', ...p }) => {
  const paths = {
    down: 'M4 6.2L8 10.2l4-4',
    up: 'M4 9.8L8 5.8l4 4',
    left: 'M9.8 4L5.8 8l4 4',
    right: 'M6.2 4L10.2 8l-4 4',
  };
  return (
    <Icon {...p}>
      <path d={paths[dir]} />
    </Icon>
  );
};

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" />
  </Icon>
);

export const SignOutIcon = (p) => (
  <Icon {...p}>
    <path d="M6.2 13.4H3.4a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1h2.8" />
    <path d="M10.4 11L13.4 8l-3-3" />
    <path d="M13.4 8H6.2" />
  </Icon>
);
