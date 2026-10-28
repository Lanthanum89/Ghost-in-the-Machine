/** A small ghost for the masthead rule. Decorative, so hidden from assistive technology. */
export function Ghost({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M12 2.5c-4 0-7 3-7 7v11.2c0 .6.7.9 1.1.5l1.9-1.9 2 2c.6.6 1.5.6 2.1 0l1.9-2 1.9 2c.6.6 1.5.6 2.1 0l1.9-2 .4.4c.4.4 1.1.1 1.1-.5V9.5c0-4-3-7-7-7z" />
      <circle cx="9.3" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
