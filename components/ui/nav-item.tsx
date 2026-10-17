"use client";

/**
 * Elemento de navegación del sidebar (01-dashboard.png, 19-states.png).
 * - Inactivo: ícono regular y texto text2.
 * - Hover: fondo según la superficie (canvas en el sidebar, surface2 en tarjetas).
 * - Activo: píldora de superficie con sombra (borde en oscuro), ícono sólido
 *   en naranja gráfico y texto semibold en ember-text (DESIGN_SPEC §1: "active
 *   nav label"; 5.10:1 en claro y 8.25:1 en oscuro sobre surface).
 * - La píldora es un Highlight (Animate UI, spec §7): sigue al puntero y a la
 *   ruta con el resorte de la librería. Fuera de un <Highlight> marca solo el
 *   activo.
 * - Al presionar, escala 0.97 (press-scale).
 * - Foco: anillo global.
 */
import Link from "next/link";

import { cn } from "@/lib/utils";

import { HighlightBackground, useHighlightItem } from "./highlight";
import { Icon } from "./icon";
import type { IconName, SolidIconName } from "./icon-registry";

type Props = {
  href: string;
  label: string;
  icon: IconName & SolidIconName;
  active: boolean;
  /** Fondo sobre el que va (cambia el color de hover). */
  surface?: "canvas" | "card";
  className?: string;
};

export function NavItem({ href, label, icon, active, surface = "canvas", className }: Props) {
  const { highlighted, handlers } = useHighlightItem(href, active);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      {...handlers}
      className={cn(
        "rounded-control text-body press-scale relative flex h-[42px] items-center gap-3 px-3 transition-colors duration-100",
        active
          ? "text-ember-text font-semibold"
          : cn(
              "text-ink-2 font-medium",
              surface === "canvas" ? "hover:bg-hover-canvas" : "hover:bg-surface2",
            ),
        className,
      )}
    >
      <HighlightBackground
        show={highlighted}
        className="rounded-control border-card-edge bg-surface shadow-card border"
      />
      <span className="relative flex items-center gap-3">
        {active ? (
          <Icon name={icon} variant="solid" className="text-ember" />
        ) : (
          <Icon name={icon} />
        )}
        {label}
      </span>
    </Link>
  );
}
