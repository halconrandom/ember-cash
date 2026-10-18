/**
 * /privacidad. Pública: el proxy no pide sesión. El texto sale de legal.privacy.
 */
import { LegalPage } from "@/components/legal/legal-page";
import { getPublicEnv } from "@/lib/env";

export default function PrivacyPage() {
  return <LegalPage section="privacy" contactEmail={getPublicEnv().NEXT_PUBLIC_CONTACT_EMAIL} />;
}
