import { Play } from 'lucide-react';
import type { SegmentoAnalise } from '../../types/analysis.ts';

interface IncongruencesTabProps {
  trechos: SegmentoAnalise[];
  hasAudio: boolean;
  onPlayAtTime?: (mmss: string) => void;
}

export function IncongruencesTab({
  trechos,
  hasAudio,
  onPlayAtTime,
}: IncongruencesTabProps) {
  const incongruencias = trechos.filter(
    (t) => t.falante === 'Paciente' && t.congruencia.status === 'nao_combina'
  );

  if (incongruencias.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-bold text-slate-900">
          Nenhuma incongruência acentuada identificada
        </h2>
        <p className="mt-2 text-base text-slate-600">
          Nos trechos analisados, o conteúdo verbal e o tom de voz pareceram alinhados. Ainda assim,
          confira a transcrição e ouça momentos específicos caso julgue necessário.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">
          Momentos em que o que é dito e o tom de voz podem não combinar ({incongruencias.length})
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Estes apontamentos são hipóteses baseadas no encontro entre conteúdo verbal e prosódia,
          para exploração em sessão.
        </p>
      </div>

      {incongruencias.map((seg, idx) => (
        <article
          key={`${seg.inicio}-${idx}`}
          className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-amber-950">
              <span className="font-mono font-semibold tabular-nums">
                {seg.inicio} – {seg.fim}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold">Fala e voz divergem</span>
              {seg.temas.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{seg.temas.join(', ')}</span>
                </>
              )}
            </div>

            {hasAudio && onPlayAtTime && (
              <button
                type="button"
                onClick={() => onPlayAtTime(seg.inicio)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-amber-50 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5 fill-current text-amber-800" aria-hidden="true" />
                <span>Ouvir trecho</span>
              </button>
            )}
          </div>

          <div className="mt-3 space-y-2 text-base text-slate-900">
            <p>
              <strong>O que foi dito:</strong> “{seg.transcricao}”
            </p>
            <p className="text-slate-800">
              <strong>Como foi dito:</strong> tom {seg.marcadores_da_voz.tom}, intensidade{' '}
              {seg.marcadores_da_voz.intensidade}, velocidade {seg.marcadores_da_voz.velocidade},
              qualidade {seg.marcadores_da_voz.qualidade_da_voz}
              {seg.marcadores_da_voz.sinais_nao_verbais.length > 0
                ? `, sinais não verbais: ${seg.marcadores_da_voz.sinais_nao_verbais.join(', ')}`
                : ''}.
            </p>
            <p className="rounded-xl border border-amber-200 bg-white/80 p-3.5 text-slate-800">
              <strong>Hipótese de incongruência:</strong> {seg.congruencia.explicacao}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
