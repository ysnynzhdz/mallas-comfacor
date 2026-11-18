/** Sello provisional (hasta recibir el logo oficial): monograma sobre un rombo tejido. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="38" height="38" rx="6" fill="#ffffff" />
      <path d="M20 5 L35 20 L20 35 L5 20 Z" fill="#e8dcc0" />
      <path d="M20 9 L31 20 L20 31 L9 20 Z" fill="#14213d" />
      <path d="M20 14 L26 20 L20 26 L14 20 Z" fill="#e8dcc0" />
      <path d="M20 17.5 L22.5 20 L20 22.5 L17.5 20 Z" fill="#0b6e6e" />
    </svg>
  );
}
