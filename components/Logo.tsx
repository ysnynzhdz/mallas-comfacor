/** Logo provisional hasta recibir el logo oficial de la institución. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white font-black text-institucional"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      MC
    </span>
  );
}
