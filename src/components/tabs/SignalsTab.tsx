import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { SegmentoAnalise } from '../../types/analysis.ts';

interface SignalsTabProps {
  trechos: SegmentoAnalise[];
  hasAudio: boolean;
  onPlayAtTime?: (mmss: string) => void;
}

interface FlattenedSignal {
  area: string;
  justificativa: string;
  pergunta_sugerida: string;
  inicio: string;
  fim: string;
  transcricao: string;
  comoFoiDito: string;
}

export function SignalsTab({ trechos, hasAudio, onPlayAtTime }: SignalsTabProps) {
  const allSignals = useMemo<FlattenedSignal[]>(() => {
    const list: FlattenedSignal[] = [];
    for (const seg of trechos) {
      if (seg.falante !== 'Paciente') continue;
      for (const s of seg.sinais_para_investigar) {
        const naoVerbais =
          seg.marcadores_da_voz.sinais_nao_verbais.length > 0
            ? `, sinais: ${seg.marcadores_da_voz.sinais_nao_verbais.join(', ')}`
            : '';
        list.push({
          area: s.area,
          justificativa: s.justificativa,
          pergunta_sugerida: s.pergunta_sugerida,
          inicio: seg.inicio,
          fim: seg.fim,
          transcricao: seg.transcricao,
          comoFoiDito: `Tom ${seg.marcadores_da_voz.tom}, intensidade ${seg.marcadores_da_voz.intensidade}, velocidade ${seg.marcadores_da_voz.velocidade}, pausas: ${seg.marcadores_da_voz.pausas}, qualidade: ${seg.marcadores_da_voz.qualidade_da_voz}${naoVerbais}.`,
        });
      }
    }
    return list;
  }, [trechos]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSignals) set.add(s.area.toLowerCase());
    return Array.from(set);
  }, [allSignals]);

  const [selectedArea, setSelectedArea] = useState<string>('todas');

  const filtered = useMemo(() => {
    if (selectedArea === 'todas') return allSignals;
    return allSignals.filter((s) => s.area.toLowerCase() === selectedArea);
  }, [allSignals, selectedArea]);

  if (allSignals.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-bold text-slate-900">
          Nenhum sinal específico destacado para investigação
        </h2>
        <p className="mt-2 text-base text-slate-600">
          Os trechos analisados não apresentaram marcadores vocais ou verbais destacados para
          investigação clínica adicional.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">
          Sinais para investigar por área ({allSignals.length})
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Hipóteses clínicas vinculadas a trechos da sessão, sem caráter diagnóstico, com sugestões
          de perguntas abertas para a próxima consulta.
        </p>

        {areas.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedArea('todas')}
              className={`min-h-[40px] rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                selectedArea === 'todas'
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todas as áreas
            </button>
            {areas.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setSelectedArea(area)}
                className={`min-h-[40px] rounded-xl px-3.5 text-sm font-medium capitalize transition-colors whitespace-nowrap ${
                  selectedArea === area
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {filtered.map((item, idx) => (
          <article
            key={`${item.area}-${item.inicio}-${idx}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-bold capitalize text-teal-800">{item.area}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-medium tabular-nums text-slate-900">
                  {item.inicio} – {item.fim}
                </span>
              </div>

              {hasAudio && onPlayAtTime && (
                <button
                  type="button"
                  onClick={() => onPlayAtTime(item.inicio)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Play className="h-3.5 w-3.5 fill-current text-teal-700" aria-hidden="true" />
                  <span>Ouvir trecho</span>
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2.5 text-base text-slate-800">
              <p>
                <strong className="text-slate-900">O que foi dito:</strong> “{item.transcricao}”
              </p>
              <p>
                <strong className="text-slate-900">Como foi dito:</strong> {item.comoFoiDito}
              </p>
              <p>
                <strong className="text-slate-900">O que investigar (hipótese):</strong>{' '}
                {item.justificativa}
              </p>
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-slate-900">
                <p className="text-sm font-semibold text-teal-900">
                  Sugestão de pergunta para a próxima sessão
                </p>
                <p className="mt-1 text-base font-medium">“{item.pergunta_sugerida}”</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
