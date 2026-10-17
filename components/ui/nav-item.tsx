"use client";

/**
 * Elemento de navegación del sidebar (01-dashboard.png, 19-states.png).
 * - Inactivo: ícono regular y texto text2.
 * - Hover: fondo según la superficie (canvas en el sidebar, surface2 en tarjetas).
 * - Activo: píldora de superficie con sombra (borde en oscuro), ícono sólido
 *   en naranja gráfico y texto semibold. La píldora se desliza entre
 *   elementos con un spring sin rebote.
 * - Foco: anillo global.
 */
import { motion } from "motion/react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";
import type { IconName, SolidIconName } from "./icon-registry";

type Props = {
  href: string;
  label: string;
  icon: IconName & SolidIconName;
  active: boolean;
  /** Fondo sobre el que va (cambia el color de hover). */
  surface?: "canvas" | "card";
  /** Id compartido para que la píldora activa se deslice entre elementos. */
  layoutGroup?: string;
  className?: string;
};

export function NavItem({
  href,
  label,
  icon,
  active,
  surface = "canvas",
  layoutGroup = "nav",
  className,
}: Props) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-control text-body relative flex h-[42px] items-center gap-3 px-3 transition-colors duration-100",
        active
          ? "text-ink font-semibold"
          : cn(
              "text-ink-2 font-medium",
              surface === "canvas" ? "hover:bg-hover-canvas" : "hover:bg-surface2",
            ),
        className,
      )}
    >
      {active && (
        <motion.span
          layoutId={`nav-active-${layoutGroup}`}
          aria-hidden
          className="rounded-control border-card-edge bg-surface shadow-card absolute inset-0 border"
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        />
      )}
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
