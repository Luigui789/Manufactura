import { Info } from 'lucide-react';

export const CARBON_DISCLAIMER =
  'Estimación académica de huella parcial de carbono basada en factores documentados. No constituye certificación, verificación independiente ni ACV completo.';

/** Aviso metodológico visible en borrador y en huella finalizada. */
export function CarbonDisclaimer() {
  return (
    <aside
      aria-label="Aviso metodológico"
      className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-950"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{CARBON_DISCLAIMER}</p>
    </aside>
  );
}
