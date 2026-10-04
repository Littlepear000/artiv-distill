const COLORS = ["bg-sky-600", "bg-emerald-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600"];

export default function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const color = COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
