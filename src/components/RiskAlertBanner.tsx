import { AlertTriangle, Phone } from 'lucide-react';
import type { SegmentoAnalise } from '../types/analysis.ts';

interface RiskAlertBannerProps {
  trechosRisco: SegmentoAnalise[];
  onSelectTime?: (inicio: string) => void;
}

export function RiskAlertBanner({ trechosRisco, onSelectTime }: RiskAlertBannerProps) {
  if (trechosRisco.length === 0) return null;

  const primeiro = trechosRisco[0];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-[69px] z-20 border-b border-red-300 bg-red-700 text-white shadow-sm"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-100" aria-hidden="true" />
          <div className="text-sm leading-snug sm:text-base">
            <p className="font-semibold">
              Alerta de risco identificado ({trechosRisco.length}{' '}
              {trechosRisco.length === 1 ? 'trecho' : 'trechos'}) — A avaliação do risco cabe à psicóloga responsável.
            </p>
            <p className="mt-0.5 text-red-100">
              <span className="font-mono tabular-nums">
                [{primeiro.inicio}–{primeiro.fim}]
              </span>{' '}
              “{primeiro.transcricao}” · {primeiro.alerta_de_risco.motivo}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {onSelectTime && (
            <button
              type="button"
              onClick={() => onSelectTime(primeiro.inicio)}
              className="min-h-[40px] rounded-lg border border-red-300/60 bg-red-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-900 whitespace-nowrap"
            >
              Ver trecho ({primeiro.inicio})
            </button>
          )}
          <div className="flex items-center gap-3 font-mono text-sm font-semibold tabular-nums text-white whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              CVV 188
            </span>
            <span aria-hidden="true">·</span>
            <span>SAMU 192</span>
          </div>
        </div>
      </div>
    </div>
  );
}
