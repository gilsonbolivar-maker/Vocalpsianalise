import { Loader2, XCircle } from 'lucide-react';
import type { SegmentoAnalise } from '../types/analysis.ts';

interface ProcessingScreenProps {
  fileName: string;
  stageLabel: string;
  currentBlock: number;
  totalBlocks: number;
  partialSegments: SegmentoAnalise[];
  onCancel: () => void;
}

export function ProcessingScreen({
  fileName,
  stageLabel,
  currentBlock,
  totalBlocks,
  partialSegments,
  onCancel,
}: ProcessingScreenProps) {
  const progressPct =
    totalBlocks > 0
      ? Math.min(100, Math.round((Math.max(0, currentBlock - 0.5) / totalBlocks) * 100))
      : 15;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{fileName}</p>
            <h1 className="mt-1 flex items-center gap-3 text-xl font-bold text-slate-900 sm:text-2xl">
              <Loader2 className="h-6 w-6 animate-spin text-teal-700 shrink-0" aria-hidden="true" />
              <span>{stageLabel}</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <span>Cancelar análise</span>
          </button>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm font-medium text-slate-600 tabular-nums">
            <span>
              {totalBlocks > 0
                ? `Analisando bloco ${currentBlock} de ${totalBlocks}`
                : 'Preparando áudio localmente'}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-700 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Documento de apoio. Hipóteses a confirmar pelo profissional responsável.
        </p>
      </section>

      {/* Trechos aparecendo conforme cada bloco fica pronto */}
      {partialSegments.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            Trechos já processados ({partialSegments.length})
          </h2>
          <div className="space-y-3">
            {partialSegments.map((seg, idx) => (
              <article
                key={`${seg.inicio}-${idx}`}
                className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span className="font-mono font-medium tabular-nums text-slate-700">
                    {seg.inicio} – {seg.fim}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`font-semibold ${
                      seg.falante === 'Paciente' ? 'text-teal-800' : 'text-slate-700'
                    }`}
                  >
                    {seg.falante}
                  </span>
                  {seg.congruencia.status === 'nao_combina' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-amber-800">
                        Possível incongruência vocal
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-base leading-relaxed text-slate-800">{seg.transcricao}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
