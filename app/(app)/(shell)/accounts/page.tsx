/**
 * Estado de cuentas (/accounts), enlazado desde el dashboard. Cuentas
 * personales: saldo de account_balance; las tarjetas muestran deuda, cupo,
 * disponible, día de pago y tasa. Solo lectura.
 */
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getAccountStatements } from "@/lib/accounts/statement";

import { AccountsView } from "./accounts-view";

export default function AccountsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AccountsContent />
    </Suspense>
  );
}

async function AccountsContent() {
  return <AccountsView accounts={await getAccountStatements()} />;
}
