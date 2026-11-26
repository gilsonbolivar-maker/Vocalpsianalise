import { useMemo, useState } from 'react';
import type { SegmentoAnalise } from '../../types/analysis.ts';
import { parseMMSSToSeconds } from '../../utils/validation.ts';

interface EmotionsTabProps {
  trechos: SegmentoAnalise[];
}

const EMOTION_COLORS: Record<string, string> = {
  tristeza: '#1D4ED8',
  'ansiedade ou medo': '#D97706',
  'raiva ou irritação': '#DC2626',
  'culpa ou vergonha': '#7C3AED',
  desesperança: '#991B1B',
  'apatia ou desânimo': '#475569',
  'alegria ou alívio': '#0F766E',
  tensão: '#EA580C',
  confusão: '#0284C7',
  neutro: '#94A3B8',
};

export function EmotionsTab({ trechos }: EmotionsTabProps) {
  const patientSegments = useMemo(
    () => trechos.filter((t) => t.falante === 'Paciente'),
    [trechos]
  );

  const availableEmotions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const seg of patientSegments) {
      for (const emo of seg.emocoes) {
        if (emo.intensidade > 0) {
          counts.set(emo.emocao, (counts.get(emo.emocao) || 0) + emo.intensidade);
        }
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [patientSegments]);

  const [selectedEmotion, setSelectedEmotion] = useState<string>('todas');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Construir série temporal dos trechos do paciente
  const timelinePoints = useMemo(() => {
    return patientSegments.map((seg, idx) => {
      const startSec = parseMMSSToSeconds(seg.inicio);
      const relevant =
        selectedEmotion === 'todas'
          ? seg.emocoes.filter((e) => e.emocao !== 'neutro')
          : seg.emocoes.filter((e) => e.emocao === selectedEmotion);

      const maxItem =
        relevant.sort((a, b) => b.intensidade - a.intensidade)[0] ||
        seg.emocoes[0] || {
          emocao: 'neutro',
          intensidade: 0,
          confianca: 'baixa',
          evidencias_na_voz: 'Sem variação emocional expressiva percebida.',
        };

      return {
        idx,
        inicio: seg.inicio,
        fim: seg.fim,
        startSec,
        intensidade: maxItem.intensidade,
        emocao: maxItem.emocao,
        confianca: maxItem.confianca,
        evidencia: maxItem.evidencias_na_voz,
        transcricao: seg.transcricao,
      };
    });
  }, [patientSegments, selectedEmotion]);

  if (patientSegments.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-base text-slate-600">
        Não foram identificados trechos claros de fala do paciente para mapear emoções na voz.
      </div>
    );
  }

  // Dimensões do SVG responsivo
  const svgW = 820;
  const svgH = 260;
  const padL = 48;
  const padR = 24;
  const padT = 20;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const activePoint =
    hoveredIdx !== null && timelinePoints[hoveredIdx]
      ? timelinePoints[hoveredIdx]
      : timelinePoints.reduce((best, cur) => (cur.intensidade > best.intensidade ? cur : best), timelinePoints[0]);

  const coords = timelinePoints.map((pt, i) => {
    const x =
      timelinePoints.length === 1
        ? padL + plotW / 2
        : padL + (i / (timelinePoints.length - 1)) * plotW;
    const y = padT + plotH - (pt.intensidade / 3) * plotH;
    return { x, y, pt };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPoints =
    coords.length > 0
      ? `${coords[0].x},${padT + plotH} ${polylinePoints} ${coords[coords.length - 1].x},${padT + plotH}`
      : '';

  return (
    <div className="space-y-6">
      {/* Gráfico da linha do tempo emocional */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Linha do tempo da intensidade vocal sugerida
            </h2>
            <p className="text-sm text-slate-600">
              Escala de 0 (ausente) a 3 (intensa) apenas nos trechos do paciente. Toque em um ponto
              para ver a evidência na voz.
            </p>
          </div>
        </div>

        {/* Filtro interativo por emoção */}
        {availableEmotions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedEmotion('todas')}
              className={`min-h-[40px] rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                selectedEmotion === 'todas'
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Pico emocional geral
            </button>
            {availableEmotions.map((emo) => (
              <button
                key={emo}
                type="button"
                onClick={() => setSelectedEmotion(emo)}
                className={`min-h-[40px] rounded-xl px-3.5 text-sm font-medium capitalize transition-colors whitespace-nowrap ${
                  selectedEmotion === emo
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {emo}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="h-auto w-full min-w-[520px]"
            role="img"
            aria-label="Gráfico de intensidade emocional sugerida pela voz ao longo da sessão"
          >
            {/* Linhas horizontais de grade (0 a 3) */}
            {[0, 1, 2, 3].map((level) => {
              const y = padT + plotH - (level / 3) * plotH;
              return (
                <g key={level}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={svgW - padR}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray={level === 0 ? undefined : '4 4'}
                  />
                  <text
                    x={padL - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[12px]"
                  >
                    {level}
                  </text>
                </g>
              );
            })}

            {coords.length > 1 && (
              <>
                <polygon points={areaPoints} fill="rgba(15, 118, 110, 0.08)" />
                <polyline
                  fill="none"
                  stroke="#0F766E"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={polylinePoints}
                />
              </>
            )}

            {coords.map(({ x, y, pt }, i) => {
              const color = EMOTION_COLORS[pt.emocao] || '#0F766E';
              const isSelected = activePoint?.idx === pt.idx;
              return (
                <g
                  key={`${pt.inicio}-${i}`}
                  className="cursor-pointer"
                  onClick={() => setHoveredIdx(i)}
                  onMouseEnter={() => setHoveredIdx(i)}
                >
                  <circle cx={x} cy={y} r={16} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 7 : 5}
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  {(coords.length <= 12 || i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 8) === 0) && (
                    <text
                      x={x}
                      y={svgH - 12}
                      textAnchor="middle"
                      className="fill-slate-500 font-mono text-[11px]"
                    >
                      {pt.inicio}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Detalhe do ponto selecionado */}
        {activePoint && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 sm:text-base">
            <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
              <span className="font-mono tabular-nums">
                [{activePoint.inicio} – {activePoint.fim}]
              </span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">A voz sugere: {activePoint.emocao}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Intensidade {activePoint.intensidade}/3</span>
              <span aria-hidden="true">·</span>
              <span>Confiança {activePoint.confianca}</span>
            </div>
            <p className="mt-1.5 text-slate-700">
              <strong>Evidência na voz:</strong> {activePoint.evidencia}
            </p>
            <p className="mt-1 text-slate-600 italic">“{activePoint.transcricao}”</p>
          </div>
        )}
      </section>

      {/* Lista detalhada por trecho do paciente */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">
          Hipóteses emocionais por trecho do paciente
        </h3>
        <div className="space-y-3">
          {patientSegments.map((seg, idx) => {
            const emos = seg.emocoes.filter((e) => e.intensidade > 0);
            return (
              <article
                key={`${seg.inicio}-${idx}`}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                    {seg.inicio} – {seg.fim}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{seg.temas.join(', ') || 'Trecho de sessão'}</span>
                </div>
                <p className="mt-2 text-base text-slate-800">“{seg.transcricao}”</p>

                {emos.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Nenhuma alteração emocional expressiva sugerida pela voz neste trecho.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {emos.map((e, eIdx) => (
                      <div
                        key={eIdx}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                          <span className="capitalize">{e.emocao}</span>
                          <span className="font-mono text-xs tabular-nums text-slate-600">
                            Int. {e.intensidade}/3 · Conf. {e.confianca}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-700">{e.evidencias_na_voz}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
