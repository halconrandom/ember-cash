/**
 * Tarjeta del usuario al pie del sidebar: avatar, nombre, espacio (personal o
 * hogar) y engranaje que lleva a Ajustes.
 */
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";

type Props = {
  name: string;
  space: string;
  /** Nombre accesible del enlace a Ajustes (ya traducido). */
  settingsLabel: string;
};

export function UserCard({ name, space, settingsLabel }: Props) {
  return (
    <div className="rounded-row border-card-edge bg-surface shadow-card flex h-[50px] items-center gap-3 border pr-2 pl-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink truncate font-semibold">{name}</p>
        <p className="text-footnote text-ink-2 truncate">{space}</p>
      </div>
      <Link
        href="/settings"
        aria-label={settingsLabel}
        className="rounded-control text-ink-2 hover:bg-surface2 hover:text-ink grid size-9 place-items-center transition-colors duration-100"
      >
        <Icon name="settings" />
      </Link>
    </div>
  );
}

/** Placeholder del mismo tamaño mientras carga el perfil. */
export function UserCardSkeleton() {
  return (
    <div
      aria-hidden
      className="rounded-row border-card-edge bg-surface shadow-card h-[50px] border"
    />
  );
}
