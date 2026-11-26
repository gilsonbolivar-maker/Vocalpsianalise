import { useMemo, useState } from 'react';
import { Play, Search } from 'lucide-react';
import type { SegmentoAnalise } from '../../types/analysis.ts';

interface TranscriptTabProps {
  trechos: SegmentoAnalise[];
  onPlayAtTime?: (mmss: string) => void;
  hasAudio: boolean;
  highlightedTime?: string | null;
}

export function TranscriptTab({
  trechos,
  onPlayAtTime,
  hasAudio,
  highlightedTime,
}: TranscriptTabProps) {
  const [speakerFilter, setSpeakerFilter] = useState<'todos' | 'Paciente' | 'Psicóloga'>('todos');
  const [onlyHighEmotion, setOnlyHighEmotion] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trechos.filter((t) => {
      if (speakerFilter !== 'todos' && t.falante !== speakerFilter) return false;
      const maxInt = Math.max(0, ...t.emocoes.map((e) => e.intensidade));
      if (onlyHighEmotion && maxInt < 2) return false;
      if (q) {
        const hay = `${t.transcricao} ${t.temas.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [trechos, speakerFilter, onlyHighEmotion, query]);

  return (
    <div className="space-y-6">
      {/* Filtros simples e amplos para toque */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(['todos', 'Paciente', 'Psicóloga'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSpeakerFilter(opt)}
                className={`min-h-[40px] rounded-lg px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  speakerFilter === opt
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt === 'todos' ? 'Ambos falantes' : opt}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOnlyHighEmotion((v) => !v)}
            className={`min-h-[44px] rounded-xl border px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
              onlyHighEmotion
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Só carga emocional alta
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na transcrição..."
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-base text-slate-600">
          Nenhum trecho corresponde aos filtros selecionados.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((seg, idx) => {
            const topEmocoes = seg.emocoes
              .filter((e) => e.intensidade > 0 && e.emocao !== 'neutro')
              .sort((a, b) => b.intensidade - a.intensidade);
            const maxIntensity = Math.max(0, ...topEmocoes.map((e) => e.intensidade));
            const isRisk = seg.alerta_de_risco.status === 'sim';
            const isHighEmotion = maxIntensity >= 2 || seg.congruencia.status === 'nao_combina';
            const isHighlighted = highlightedTime === seg.inicio;

            let cardSurface = 'border-slate-200 bg-white';
            if (isRisk) {
              cardSurface = 'border-red-300 bg-red-50/70';
            } else if (isHighEmotion && seg.falante === 'Paciente') {
              cardSurface = 'border-amber-300 bg-amber-50/60';
            }
            if (isHighlighted) {
              cardSurface += ' ring-2 ring-teal-700';
            }

            return (
              <article
                key={`${seg.inicio}-${seg.fim}-${idx}`}
                className={`rounded-2xl border p-5 transition-colors sm:p-6 ${cardSurface}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
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
                    {seg.temas.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">{seg.temas.join(', ')}</span>
                      </>
                    )}
                    {isRisk && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-red-800">Alerta de risco</span>
                      </>
                    )}
                    {seg.congruencia.status === 'nao_combina' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-900">Fala e tom divergem</span>
                      </>
                    )}
                  </div>

                  {hasAudio && onPlayAtTime && (
                    <button
                      type="button"
                      onClick={() => onPlayAtTime(seg.inicio)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Play className="h-3.5 w-3.5 fill-current text-teal-700" aria-hidden="true" />
                      <span>Ouvir trecho</span>
                    </button>
                  )}
                </div>

                <p className="mt-3 text-base leading-relaxed text-slate-900 sm:text-lg">
                  {seg.transcricao}
                </p>

                {seg.falante === 'Paciente' && (
                  <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-3 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">Como foi dito:</span> tom{' '}
                      {seg.marcadores_da_voz.tom}, intensidade {seg.marcadores_da_voz.intensidade},
                      velocidade {seg.marcadores_da_voz.velocidade}, pausas:{' '}
                      {seg.marcadores_da_voz.pausas}, qualidade:{' '}
                      {seg.marcadores_da_voz.qualidade_da_voz}
                      {seg.marcadores_da_voz.sinais_nao_verbais.length > 0
                        ? ` (${seg.marcadores_da_voz.sinais_nao_verbais.join(', ')})`
                        : ''}.
                    </p>

                    {topEmocoes.length > 0 && (
                      <p>
                        <span className="font-semibold text-slate-900">
                          A voz sugere (hipóteses):
                        </span>{' '}
                        {topEmocoes
                          .map(
                            (e) =>
                              `${e.emocao} (intensidade ${e.intensidade}/3, confiança ${e.confianca} — ${e.evidencias_na_voz})`
                          )
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
