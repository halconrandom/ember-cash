/**
 * /terminos. Pública: el proxy no pide sesión. El texto sale de legal.terms.
 */
import { LegalPage } from "@/components/legal/legal-page";
import { getPublicEnv } from "@/lib/env";

export default function TermsPage() {
  return <LegalPage section="terms" contactEmail={getPublicEnv().NEXT_PUBLIC_CONTACT_EMAIL} />;
}
