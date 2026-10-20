/**
 * Error de un paso del wizard que no pertenece a un campo: texto e ícono,
 * como pide la spec. Los campos usan <Field>, que ya trae los dos.
 */
import { Icon } from "@/components/ui/icon";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-body text-negative-text flex items-start gap-2">
      <Icon name="info" size={18} className="text-negative-text mt-0.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
