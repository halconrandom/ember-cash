/**
 * Avatar con iniciales. Los colores de miembro son ink (A) y slate (B); el
 * naranja nunca identifica a un miembro.
 */
import { cn } from "@/lib/utils";

/** Iniciales a partir del nombre: "Isaac Gómez" -> "IG". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  member = "a",
  size = 34,
  className,
}: {
  name: string | null | undefined;
  member?: "a" | "b";
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "text-callout grid shrink-0 place-items-center rounded-full font-semibold",
        member === "a" ? "bg-member-a text-member-a-on" : "bg-member-b text-member-b-on",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
