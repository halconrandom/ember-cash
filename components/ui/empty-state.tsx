/**
 * Estado vacío con acción (19-states.png, "Empty state"): ícono en círculo,
 * título, explicación y botones.
 */
import { cn } from "@/lib/utils";

import { Icon } from "./icon";
import type { IconName } from "./icon-registry";

type Props = {
  icon: IconName;
  title: string;
  description?: string;
  /** Botones (uno primario como máximo). */
  actions?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, actions, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-card bg-surface2 flex flex-col items-center px-8 py-16 text-center",
        className,
      )}
    >
      <span className="bg-surface text-ink-2 grid size-16 place-items-center rounded-full">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-headline text-ink mt-6">{title}</h3>
      {description && <p className="text-body text-ink-2 mt-2 max-w-[22rem]">{description}</p>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
