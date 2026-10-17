/**
 * Settings: apariencia (tema guardado en profiles.theme), cuenta y créditos.
 * Los créditos incluyen la atribución que exige la licencia gratuita de
 * Flaticon (DESIGN_SPEC §6).
 */
import { Suspense } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

import { ThemeSetting } from "./theme-setting";

export default function SettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <Card className="space-y-4">
        <CardTitle>Appearance</CardTitle>
        <ThemeSetting />
      </Card>

      <Card className="space-y-4">
        <CardTitle>Account</CardTitle>
        <Suspense fallback={<p className="h-5" />}>
          <AccountEmail />
        </Suspense>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="border-border bg-surface text-body text-ink hover:bg-surface2 inline-flex h-10 items-center rounded-full border px-6 font-semibold transition-colors duration-100"
          >
            Sign out
          </button>
        </form>
      </Card>

      <Card className="space-y-2">
        <CardTitle>About</CardTitle>
        <p className="text-body text-ink-2">
          Icons designed by{" "}
          <a
            href="https://www.flaticon.com/uicons"
            target="_blank"
            rel="noreferrer"
            className="text-ember-text font-medium underline-offset-4 hover:underline"
          >
            Flaticon
          </a>{" "}
          (Uicons) from flaticon.com.
        </p>
      </Card>
    </div>
  );
}

async function AccountEmail() {
  const user = await requireUser();
  return <p className="text-body text-ink-2">{user.email}</p>;
}
