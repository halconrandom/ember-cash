/**
 * Página centrada sin shell (login, onboarding, invitación), con la marca
 * arriba.
 */
import { LogoTile } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export function CenteredPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="mb-8 flex items-center gap-3">
        <LogoTile size={36} />
        <span className="text-brand text-ink">Ember Cash</span>
      </div>
      <div className={cn("w-full max-w-md", className)}>{children}</div>
    </main>
  );
}
