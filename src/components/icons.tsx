// Icons exported from the Figma drafts (components "icon/…"), drawn with currentColor so
// they take the colour of the text around them.
type P = { className?: string; size?: number };

export function SearchIcon({ className, size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path d="M7.33335 12C9.91068 12 12 9.91068 12 7.33335C12 4.75602 9.91068 2.66669 7.33335 2.66669C4.75602 2.66669 2.66669 4.75602 2.66669 7.33335C2.66669 9.91068 4.75602 12 7.33335 12Z" stroke="currentColor" strokeWidth="2" />
      <path d="M13.3334 13.3334L10.6667 10.6667" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden className={className}>
      <path d="M6.99996 2.91669V11.0834M2.91663 7.00002H11.0833" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon({ className, size = 13 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" aria-hidden className={className}>
      <path d="M2.16667 10.8333H4.33334L10.2917 4.87498L8.12501 2.70831L2.16667 8.66665V10.8333Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7.3125 3.52081L9.47917 5.68748" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function ArrowIcon({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden className={className}>
      <path d="M2.91669 7.00016H11.0834M8.16669 9.91683L11.0834 7.00016L8.16669 4.0835" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden className={className}>
      <path d="M6.99998 11.6668C9.57731 11.6668 11.6666 9.57749 11.6666 7.00016C11.6666 4.42283 9.57731 2.3335 6.99998 2.3335C4.42265 2.3335 2.33331 4.42283 2.33331 7.00016C2.33331 9.57749 4.42265 11.6668 6.99998 11.6668Z" stroke="currentColor" strokeWidth="2" />
      <path d="M7 4.6665V6.99984L8.75 8.1665" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MenuIcon({ className, size = 20 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path d="M2.5 5h15M2.5 10h15M2.5 15h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The segno logo. */
export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" alt="musicvolu.me" width={23} height={30} className={className} />
  );
}

export function ThumbUpIcon({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ThumbDownIcon({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CommentIcon({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M4 4h16v12H8l-4 4V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
