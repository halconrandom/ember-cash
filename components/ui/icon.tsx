/**
 * <Icon>: único punto de acceso a los íconos de la app.
 *
 *   <Icon name="home" />                    regular rounded, 20 px
 *   <Icon name="apps" variant="solid" />    sólido (solo SOLID_ICONS)
 *   <Icon name="info" label="Información" /> con nombre accesible
 *
 * El glifo hereda el color del texto (currentColor). Sin `label` es
 * decorativo (aria-hidden). El proveedor se elige en icon-registry.ts.
 */
import { cn } from "@/lib/utils";

import { ICON_SET, ICONS, SOLID_ICONS, type IconName, type SolidIconName } from "./icon-registry";

type CommonProps = {
  /** Tamaño en px (ancho = alto = tamaño de fuente del glifo). */
  size?: number;
  className?: string;
  /** Nombre accesible. Si falta, el ícono es decorativo. */
  label?: string;
};

export type IconProps = CommonProps &
  ({ name: IconName; variant?: "regular" } | { name: SolidIconName; variant: "solid" });

export function Icon({ name, variant = "regular", size = 20, className, label }: IconProps) {
  const solid = variant === "solid";
  const entry = solid ? SOLID_ICONS[name as SolidIconName] : ICONS[name as IconName];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (ICON_SET === "lucide") {
    const Lucide = entry.lucide;
    return (
      <Lucide
        size={size}
        strokeWidth={1.75}
        fill={solid ? "currentColor" : "none"}
        className={cn("shrink-0", className)}
        {...a11y}
      />
    );
  }

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)}
      style={{ width: size, height: size, fontSize: size }}
      {...a11y}
    >
      <i className={`fi fi-${solid ? "sr" : "rr"}-${entry.uicon} flex`} />
    </span>
  );
}
