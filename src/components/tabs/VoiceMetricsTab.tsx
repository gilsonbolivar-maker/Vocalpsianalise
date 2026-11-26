import type { JanelaAcustica, MedidasAcusticasSessao } from '../../types/analysis.ts';

interface VoiceMetricsTabProps {
  medidas: MedidasAcusticasSessao;
  fatoresNaoEmocionais: string[];
  fatoresContextoInformados: string;
  observacoesQualidade: string[];
}

interface MiniChartProps {
  title: string;
  unit: string;
  subtitle: string;
  janelas: JanelaAcustica[];
  accessor: (j: JanelaAcustica) => number | null;
  strokeColor: string;
  baselineValue: number | null;
}

function AcousticLineChart({
  title,
  unit,
  subtitle,
  janelas,
  accessor,
  strokeColor,
  baselineValue,
}: MiniChartProps) {
  const validPoints = janelas
    .map((j, idx) => ({ idx, label: j.tempoLabel, val: accessor(j) }))
    .filter((p): p is { idx: number; label: string; val: number } => p.val !== null && Number.isFinite(p.val));

  const svgW = 540;
  const svgH = 190;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  if (validPoints.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <p className="mt-6 text-sm text-slate-500">
          Dados insuficientes nesta gravação para traçar esta medida.
        </p>
      </section>
    );
  }

  const vals = validPoints.map((p) => p.val);
  let minVal = Math.min(...vals);
  let maxVal = Math.max(...vals);
  if (baselineValue !== null) {
    minVal = Math.min(minVal, baselineValue);
    maxVal = Math.max(maxVal, baselineValue);
  }
  if (maxVal - minVal < 1) {
    minVal -= 1;
    maxVal += 1;
  } else {
    const margin = (maxVal - minVal) * 0.12;
    minVal -= margin;
    maxVal += margin;
  }

  const toY = (v: number) => padT + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
  const toX = (i: number) =>
    validPoints.length === 1 ? padL + plotW / 2 : padL + (i / (validPoints.length - 1)) * plotW;

  const poly = validPoints.map((p, i) => `${toX(i)},${toY(p.val)}`).join(' ');
  const midVal = (minVal + maxVal) / 2;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {baselineValue !== null && (
          <span className="font-mono text-xs tabular-nums text-slate-500">
            Base inicial: {baselineValue} {unit}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>

      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto w-full min-w-[320px]">
          {[minVal, midVal, maxVal].map((tick, idx) => {
            const y = toY(tick);
            return (
              <g key={idx}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[11px]"
                >
                  {tick.toFixed(unit === 'sílabas/s' ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {baselineValue !== null && (
            <line
              x1={padL}
              y1={toY(baselineValue)}
              x2={svgW - padR}
              y2={toY(baselineValue)}
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
          )}

          {validPoints.length > 1 && (
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={poly}
            />
          )}

          {validPoints.map((p, i) => (
            <g key={p.idx}>
              <circle cx={toX(i)} cy={toY(p.val)} r={3.5} fill={strokeColor} />
              {(validPoints.length <= 8 || i === 0 || i === validPoints.length - 1 || i % Math.ceil(validPoints.length / 5) === 0) && (
                <text
                  x={toX(i)}
                  y={svgH - 8}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono text-[11px]"
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

export function VoiceMetricsTab({
  medidas,
  fatoresNaoEmocionais,
  fatoresContextoInformados,
  observacoesQualidade,
}: VoiceMetricsTabProps) {
  const { geral, linhaDeBase } = medidas;

  const qualityLabel =
    medidas.qualidadeAudio === 'boa'
      ? 'Boa'
      : medidas.qualidadeAudio === 'moderada'
        ? 'Moderada'
        : 'Baixa (confiança reduzida)';

  return (
    <div className="space-y-6">
      {/* Resumo das 4 medidas objetivas vs linha de base */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-600">Altura média (F0)</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {geral.f0MediaHz ? `${geral.f0MediaHz} Hz` : '—'}
          </p>
          <p className="mt-1 text-sm text-slate-600 tabular-nums">
            Variação: {geral.f0VariacaoHz ? `±${geral.f0VariacaoHz} Hz` : '—'} · Base:{' '}
            {linhaDeBase.f0MediaHz ? `${linhaDeBase.f0MediaHz} Hz` : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-600">Volume médio</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {geral.volumeMedioDb} dBFS
          </p>
          <p className="mt-1 text-sm text-slate-600 tabular-nums">
            Variação: ±{geral.volumeVariacaoDb} dB · Base: {linhaDeBase.volumeMedioDb} dBFS
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-600">Silêncio e pausas</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {geral.proporcaoSilencioPct}%
          </p>
          <p className="mt-1 text-sm text-slate-600 tabular-nums">
            Média: {geral.duracaoMediaPausasSeg}s · Longas (≥1,5s): {geral.totalPausasLongas}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-600">Velocidade aproximada</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {geral.velocidadeSilabasSeg} síl/s
          </p>
          <p className="mt-1 text-sm text-slate-600 capitalize tabular-nums">
            Ritmo {geral.velocidadeLabel} · Base: {linhaDeBase.velocidadeSilabasSeg} síl/s
          </p>
        </div>
      </section>

      {/* Gráficos ao longo da sessão */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AcousticLineChart
          title="Altura da voz ao longo da sessão (F0)"
          unit="Hz"
          subtitle="Frequência fundamental estimada nos trechos vozeados (linha tracejada = base inicial)."
          janelas={medidas.janelas}
          accessor={(j) => j.f0MediaHz}
          strokeColor="#0F766E"
          baselineValue={linhaDeBase.f0MediaHz}
        />
        <AcousticLineChart
          title="Volume da fala ao longo da sessão"
          unit="dBFS"
          subtitle="Intensidade média em decibéis relativos ao longo dos minutos."
          janelas={medidas.janelas}
          accessor={(j) => j.volumeMedioDb}
          strokeColor="#1D4ED8"
          baselineValue={linhaDeBase.volumeMedioDb}
        />
        <AcousticLineChart
          title="Proporção de silêncio e pausas"
          unit="%"
          subtitle="Percentual de pausas ≥300ms dentro de cada janela temporal."
          janelas={medidas.janelas}
          accessor={(j) => j.silencioPct}
          strokeColor="#B45309"
          baselineValue={linhaDeBase.proporcaoSilencioPct}
        />
        <AcousticLineChart
          title="Velocidade aproximada da fala"
          unit="sílabas/s"
          subtitle="Núcleos silábicos por segundo de fala ativa (estimativa acústica local)."
          janelas={medidas.janelas}
          accessor={(j) => j.velocidadeSilabasSeg}
          strokeColor="#7C3AED"
          baselineValue={linhaDeBase.velocidadeSilabasSeg}
        />
      </div>

      {/* Qualidade da gravação e fatores não emocionais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">
          Qualidade do áudio e fatores não emocionais
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <span>
            <strong>Qualidade estimada:</strong> {qualityLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Relação sinal-ruído: ~{medidas.snrEstimadoDb} dB
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">Saturação: {medidas.taxaClippingPct}%</span>
        </div>

        {(observacoesQualidade.length > 0 || medidas.observacoesQualidade.length > 0) && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {[...medidas.observacoesQualidade, ...observacoesQualidade].map((obs, idx) => (
              <li key={idx}>{obs}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">
            Possíveis confundidores não emocionais a considerar:
          </p>
          {fatoresContextoInformados && (
            <p className="mt-1">
              <strong>Informado pela psicóloga:</strong> {fatoresContextoInformados}
            </p>
          )}
          {fatoresNaoEmocionais.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {fatoresNaoEmocionais.map((f, idx) => (
                <li key={idx}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-slate-600">
              Lembre-se de ponderar sotaque regional, estilo pessoal de fala, cansaço, gripe,
              medicações ou condições neurológicas/do neurodesenvolvimento (como autismo, Parkinson
              ou quadros depressivos) ao interpretar a prosódia.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
