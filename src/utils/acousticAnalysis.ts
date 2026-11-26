import type {
  JanelaAcustica,
  MedidasAcusticasSessao,
  ResumoMetricasVoz,
} from '../types/analysis.ts';
import { AudioAnalyzer } from './audioAnalyzer.ts';
import { formatSecondsToMMSS, MAX_DURATION_SECONDS } from './validation.ts';

export const TARGET_SAMPLE_RATE = 16000;
const BLOCK_DURATION_SEC = 300; // ~5 minutos
const OVERLAP_SEC = 3; // 3 segundos de sobreposição

export interface AudioBlock {
  index: number;
  total: number;
  startSec: number;
  endSec: number;
  wavBase64: string;
  mimeType: 'audio/wav';
}

export interface DecodedAudioResult {
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
}

/**
 * Decodifica qualquer arquivo/blob de áudio no navegador e converte para mono 16kHz.
 * Opcionalmente recebe um AudioContext já desbloqueado no toque (regra do Safari iOS).
 */
export async function decodeAndResampleAudio(
  fileOrBlob: Blob,
  existingContext?: AudioContext | null
): Promise<DecodedAudioResult> {
  const arrayBuffer = await fileOrBlob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Este navegador não oferece suporte à API Web Audio.');
  }

  const ctx = existingContext && existingContext.state !== 'closed' ? existingContext : new AudioCtx();
  const shouldCloseCtx = !existingContext;

  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    if (decoded.duration > MAX_DURATION_SECONDS) {
      throw new Error(
        `A gravação possui ${Math.round(decoded.duration / 60)} minutos. O limite máximo por análise é de 60 minutos.`
      );
    }

    const monoSamples = mixDownToMono(decoded);
    const resampled = await resampleTo16kHz(monoSamples, decoded.sampleRate);

    return {
      samples: resampled,
      sampleRate: TARGET_SAMPLE_RATE,
      durationSec: resampled.length / TARGET_SAMPLE_RATE,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('60 minutos')) {
      throw err;
    }
    throw new Error(
      'Arquivo inválido ou formato não decodificável neste aparelho. Tente m4a, mp3, wav ou aac.'
    );
  } finally {
    if (shouldCloseCtx) {
      await ctx.close().catch(() => {});
    }
  }
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  if (numChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }
  return mono;
}

async function resampleTo16kHz(samples: Float32Array, sourceRate: number): Promise<Float32Array> {
  if (sourceRate === TARGET_SAMPLE_RATE) {
    return samples;
  }

  const targetLength = Math.max(1, Math.round((samples.length * TARGET_SAMPLE_RATE) / sourceRate));
  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
      const buffer = offline.createBuffer(1, samples.length, sourceRate);
      buffer.getChannelData(0).set(samples);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      return new Float32Array(rendered.getChannelData(0));
    } catch {
      // Fallback para interpolação linear se OfflineAudioContext falhar
    }
  }

  const ratio = sourceRate / TARGET_SAMPLE_RATE;
  const out = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const srcIdx = i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(samples.length - 1, idx0 + 1);
    const frac = srcIdx - idx0;
    out[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac;
  }
  return out;
}

export interface AudioBlock {
  index: number;
  total: number;
  startSec: number;
  endSec: number;
  startSample: number;
  endSample: number;
  wavBase64: string;
  mimeType: 'audio/wav';
}

/**
 * Divide áudios longos em blocos de ~5 minutos cortando em pausas naturais,
 * com 3 segundos de sobreposição entre blocos consecutivos.
 */
export function splitAudioIntoBlocks(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): AudioBlock[] {
  const totalSec = samples.length / sampleRate;
  if (totalSec <= BLOCK_DURATION_SEC + 15) {
    return [
      {
        index: 1,
        total: 1,
        startSec: 0,
        endSec: totalSec,
        startSample: 0,
        endSample: samples.length,
        wavBase64: encodeWavBase64(samples, sampleRate),
        mimeType: 'audio/wav',
      },
    ];
  }

  const ranges: Array<{ startSample: number; endSample: number }> = [];
  let cursorSample = 0;
  const targetStepSamples = BLOCK_DURATION_SEC * sampleRate;
  const overlapSamples = OVERLAP_SEC * sampleRate;

  while (cursorSample < samples.length) {
    const remaining = samples.length - cursorSample;
    if (remaining <= (BLOCK_DURATION_SEC + 20) * sampleRate) {
      ranges.push({ startSample: cursorSample, endSample: samples.length });
      break;
    }

    const nominalCut = cursorSample + targetStepSamples;
    const searchStart = Math.max(cursorSample + 120 * sampleRate, nominalCut - 20 * sampleRate);
    const searchEnd = Math.min(samples.length - 5 * sampleRate, nominalCut + 15 * sampleRate);
    const bestCut = findQuietestSplitSample(samples, sampleRate, searchStart, searchEnd);

    ranges.push({ startSample: cursorSample, endSample: bestCut });
    cursorSample = Math.max(cursorSample + 60 * sampleRate, bestCut - overlapSamples);
  }

  return ranges.map((range, idx) => {
    const slice = samples.subarray(range.startSample, range.endSample);
    return {
      index: idx + 1,
      total: ranges.length,
      startSec: range.startSample / sampleRate,
      endSec: range.endSample / sampleRate,
      startSample: range.startSample,
      endSample: range.endSample,
      wavBase64: encodeWavBase64(slice, sampleRate),
      mimeType: 'audio/wav',
    };
  });
}

function findQuietestSplitSample(
  samples: Float32Array,
  sampleRate: number,
  searchStart: number,
  searchEnd: number
): number {
  const windowSamples = Math.floor(0.4 * sampleRate); // 400ms
  const stepSamples = Math.floor(0.1 * sampleRate); // 100ms
  let bestPos = Math.floor((searchStart + searchEnd) / 2);
  let minEnergy = Number.POSITIVE_INFINITY;

  for (let pos = searchStart; pos + windowSamples < searchEnd; pos += stepSamples) {
    let sumSq = 0;
    for (let i = 0; i < windowSamples; i += 4) {
      const v = samples[pos + i];
      sumSq += v * v;
    }
    if (sumSq < minEnergy) {
      minEnergy = sumSq;
      bestPos = pos + Math.floor(windowSamples / 2);
    }
  }
  return bestPos;
}

export function encodeWavBase64(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Extrai medidas acústicas objetivas da voz diretamente no navegador (Web Audio):
 * - Altura média (F0 em Hz) e variação
 * - Volume médio (RMS dBFS) e variação
 * - Proporção de silêncio e duração média das pausas
 * - Velocidade aproximada da fala (núcleos silábicos/s)
 */
export function computeAcousticMetrics(
  samples: Float32Array,
  sampleRate = TARGET_SAMPLE_RATE
): MedidasAcusticasSessao {
  const durationTotalSec = samples.length / sampleRate;
  const frameLen = Math.floor(0.03 * sampleRate); // 30ms
  const hopLen = Math.floor(0.015 * sampleRate); // 15ms
  const numFrames = Math.max(1, Math.floor((samples.length - frameLen) / hopLen));

  const frameDb = new Float32Array(numFrames);
  let clippedSamples = 0;

  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= 0.99) clippedSamples++;
  }
  const taxaClippingPct = Number(((clippedSamples / Math.max(1, samples.length)) * 100).toFixed(2));

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopLen;
    let sumSq = 0;
    for (let i = 0; i < frameLen; i++) {
      const s = samples[start + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / frameLen);
    frameDb[f] = 20 * Math.log10(rms + 1e-7);
  }

  const sortedDb = Float32Array.from(frameDb).sort();
  const noiseFloorDb = sortedDb[Math.floor(sortedDb.length * 0.1)] ?? -60;
  const p90Db = sortedDb[Math.floor(sortedDb.length * 0.9)] ?? -30;
  const speechThresholdDb = Math.max(-52, Math.min(-24, noiseFloorDb + 7));
  const snrEstimadoDb = Number(Math.max(0, p90Db - noiseFloorDb).toFixed(1));

  const voicedFlags = new Uint8Array(numFrames);
  const f0PerFrame = new Float32Array(numFrames); // 0 se não vozeado

  let voicedFrameCount = 0;
  for (let f = 0; f < numFrames; f++) {
    if (frameDb[f] > speechThresholdDb) {
      voicedFlags[f] = 1;
      voicedFrameCount++;
      const start = f * hopLen;
      f0PerFrame[f] = estimatePitchHz(samples, start, frameLen, sampleRate);
    }
  }

  const voicedDurationSec = (voicedFrameCount * hopLen) / sampleRate;
  const temFalaDetectavel = voicedDurationSec >= 0.8 && p90Db > -50;

  const observacoesQualidade: string[] = [];
  let qualidadeAudio: 'boa' | 'moderada' | 'baixa' = 'boa';

  if (!temFalaDetectavel) {
    qualidadeAudio = 'baixa';
    observacoesQualidade.push('Quase nenhuma fala audível foi detectada neste arquivo.');
  } else {
    if (snrEstimadoDb < 10) {
      qualidadeAudio = 'baixa';
      observacoesQualidade.push(
        `Ruído de fundo elevado em relação à voz (relação sinal-ruído estimada em ${snrEstimadoDb} dB). Confiança prosódica reduzida.`
      );
    } else if (snrEstimadoDb < 18) {
      qualidadeAudio = 'moderada';
      observacoesQualidade.push(
        `Ruído ambiente moderado (${snrEstimadoDb} dB). Pequenas variações de volume podem refletir o microfone.`
      );
    }

    if (taxaClippingPct > 0.5) {
      qualidadeAudio = 'baixa';
      observacoesQualidade.push(
        `Distorção por saturação detectada (${taxaClippingPct}% das amostras no limite).`
      );
    }

    if (p90Db < -38) {
      if (qualidadeAudio === 'boa') qualidadeAudio = 'moderada';
      observacoesQualidade.push('Gravação com volume geral muito baixo; microfone possivelmente distante.');
    }
  }

  const geral = computeSegmentSummary(
    frameDb,
    voicedFlags,
    f0PerFrame,
    0,
    numFrames,
    hopLen,
    sampleRate
  );

  // Linha de base: primeiros 3 minutos (ou primeira metade se sessão < 6 min)
  const baselineEndSec = durationTotalSec < 360 ? Math.max(10, durationTotalSec * 0.45) : 180;
  const baselineEndFrame = Math.min(numFrames, Math.max(1, Math.floor((baselineEndSec * sampleRate) / hopLen)));
  const linhaDeBase = computeSegmentSummary(
    frameDb,
    voicedFlags,
    f0PerFrame,
    0,
    baselineEndFrame,
    hopLen,
    sampleRate
  );

  // Janelas para gráficos ao longo da sessão (entre 10 e 48 pontos)
  const targetWindowSec = durationTotalSec <= 120 ? 10 : durationTotalSec <= 900 ? 30 : 60;
  const framesPerWindow = Math.max(10, Math.floor((targetWindowSec * sampleRate) / hopLen));
  const janelas: JanelaAcustica[] = [];

  for (let fStart = 0; fStart < numFrames; fStart += framesPerWindow) {
    const fEnd = Math.min(numFrames, fStart + framesPerWindow);
    if (fEnd - fStart < 5) continue;
    const summary = computeSegmentSummary(
      frameDb,
      voicedFlags,
      f0PerFrame,
      fStart,
      fEnd,
      hopLen,
      sampleRate
    );
    const inicioSeg = (fStart * hopLen) / sampleRate;
    const fimSeg = (fEnd * hopLen) / sampleRate;
    janelas.push({
      inicioSeg: Number(inicioSeg.toFixed(1)),
      fimSeg: Number(fimSeg.toFixed(1)),
      tempoLabel: formatSecondsToMMSS(inicioSeg),
      f0MediaHz: summary.f0MediaHz,
      volumeMedioDb: summary.volumeMedioDb,
      silencioPct: summary.proporcaoSilencioPct,
      velocidadeSilabasSeg: summary.velocidadeSilabasSeg,
    });
  }

  return {
    duracaoTotalSeg: Number(durationTotalSec.toFixed(1)),
    temFalaDetectavel,
    qualidadeAudio,
    snrEstimadoDb,
    taxaClippingPct,
    observacoesQualidade,
    geral,
    linhaDeBase,
    janelas,
  };
}

function estimatePitchHz(
  samples: Float32Array,
  start: number,
  frameLen: number,
  sampleRate: number
): number {
  const minLag = Math.floor(sampleRate / 360); // ~360 Hz
  const maxLag = Math.floor(sampleRate / 75); // ~75 Hz
  if (start + frameLen + maxLag >= samples.length) return 0;

  let energy0 = 0;
  for (let i = 0; i < frameLen; i++) {
    const v = samples[start + i];
    energy0 += v * v;
  }
  if (energy0 < 1e-6) return 0;

  let bestLag = 0;
  let bestNormCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0;
    let energyLag = 0;
    for (let i = 0; i < frameLen; i++) {
      const a = samples[start + i];
      const b = samples[start + i + lag];
      cross += a * b;
      energyLag += b * b;
    }
    const denom = Math.sqrt(energy0 * energyLag);
    if (denom > 0) {
      const normCorr = cross / denom;
      if (normCorr > bestNormCorr) {
        bestNormCorr = normCorr;
        bestLag = lag;
      }
    }
  }

  if (bestNormCorr >= 0.58 && bestLag > 0) {
    return sampleRate / bestLag;
  }
  return 0;
}

function computeSegmentSummary(
  frameDb: Float32Array,
  voicedFlags: Uint8Array,
  f0PerFrame: Float32Array,
  startFrame: number,
  endFrame: number,
  hopLen: number,
  sampleRate: number
): ResumoMetricasVoz {
  const frameStepSec = hopLen / sampleRate;
  const f0Values: number[] = [];
  const voicedDbValues: number[] = [];

  let silentFrames = 0;
  let currentSilentRun = 0;
  const pauseDurations: number[] = [];

  for (let f = startFrame; f < endFrame; f++) {
    if (voicedFlags[f] === 1) {
      voicedDbValues.push(frameDb[f]);
      if (f0PerFrame[f] >= 75 && f0PerFrame[f] <= 360) {
        f0Values.push(f0PerFrame[f]);
      }
      if (currentSilentRun * frameStepSec >= 0.3) {
        pauseDurations.push(currentSilentRun * frameStepSec);
      }
      currentSilentRun = 0;
    } else {
      silentFrames++;
      currentSilentRun++;
    }
  }
  if (currentSilentRun * frameStepSec >= 0.3) {
    pauseDurations.push(currentSilentRun * frameStepSec);
  }

  const totalFrames = Math.max(1, endFrame - startFrame);
  const proporcaoSilencioPct = Number(((silentFrames / totalFrames) * 100).toFixed(1));
  const duracaoMediaPausasSeg =
    pauseDurations.length > 0
      ? Number((pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length).toFixed(2))
      : 0;
  const totalPausasLongas = pauseDurations.filter((d) => d >= 1.5).length;

  // F0 stats com filtro interquartil simples para evitar saltos de oitava
  let f0MediaHz: number | null = null;
  let f0VariacaoHz: number | null = null;
  let f0MinHz: number | null = null;
  let f0MaxHz: number | null = null;

  if (f0Values.length >= 3) {
    const sortedF0 = [...f0Values].sort((a, b) => a - b);
    const q1 = sortedF0[Math.floor(sortedF0.length * 0.25)];
    const q3 = sortedF0[Math.floor(sortedF0.length * 0.75)];
    const iqr = q3 - q1;
    const filtered = sortedF0.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
    const useF0 = filtered.length >= 3 ? filtered : sortedF0;
    const mean = useF0.reduce((a, b) => a + b, 0) / useF0.length;
    const std = Math.sqrt(useF0.reduce((a, b) => a + (b - mean) ** 2, 0) / useF0.length);
    f0MediaHz = Number(mean.toFixed(1));
    f0VariacaoHz = Number(std.toFixed(1));
    f0MinHz = Number(useF0[0].toFixed(1));
    f0MaxHz = Number(useF0[useF0.length - 1].toFixed(1));
  }

  // Volume stats
  let volumeMedioDb = -50;
  let volumeVariacaoDb = 0;
  if (voicedDbValues.length > 0) {
    const meanDb = voicedDbValues.reduce((a, b) => a + b, 0) / voicedDbValues.length;
    const stdDb = Math.sqrt(
      voicedDbValues.reduce((a, b) => a + (b - meanDb) ** 2, 0) / voicedDbValues.length
    );
    volumeMedioDb = Number(meanDb.toFixed(1));
    volumeVariacaoDb = Number(stdDb.toFixed(1));
  }

  // Estimativa de velocidade da fala (picos de energia em trechos vozeados)
  const minPeakGapFrames = Math.max(4, Math.floor(0.11 / frameStepSec)); // ~110ms
  let syllablePeaks = 0;
  let lastPeakFrame = -minPeakGapFrames;

  for (let f = startFrame + 2; f < endFrame - 2; f++) {
    if (voicedFlags[f] !== 1) continue;
    const val = frameDb[f];
    const isLocalMax =
      val >= frameDb[f - 1] &&
      val >= frameDb[f + 1] &&
      val > frameDb[f - 2] + 1.2 &&
      val > frameDb[f + 2] + 1.2;

    if (isLocalMax && f - lastPeakFrame >= minPeakGapFrames) {
      syllablePeaks++;
      lastPeakFrame = f;
    }
  }

  const voicedSec = Math.max(0.5, voicedDbValues.length * frameStepSec);
  const velocidadeSilabasSeg =
    voicedDbValues.length >= 6 ? Number((syllablePeaks / voicedSec).toFixed(2)) : 0;

  let velocidadeLabel: 'lenta' | 'normal' | 'acelerada' = 'normal';
  if (velocidadeSilabasSeg > 0 && velocidadeSilabasSeg < 3.1) velocidadeLabel = 'lenta';
  else if (velocidadeSilabasSeg > 5.0) velocidadeLabel = 'acelerada';

  return {
    f0MediaHz,
    f0VariacaoHz,
    f0MinHz,
    f0MaxHz,
    volumeMedioDb,
    volumeVariacaoDb,
    proporcaoSilencioPct,
    duracaoMediaPausasSeg,
    totalPausasLongas,
    velocidadeSilabasSeg,
    velocidadeLabel,
  };
}

export interface GeminiBlockPayload {
  block: AudioBlock;
  acousticSummary: {
    qualidadeAudio: MedidasAcusticasSessao['qualidadeAudio'];
    snrEstimadoDb: number;
    f0MediaHz: number | null;
    f0VariacaoHz: number | null;
    volumeMedioDb: number;
    volumeVariacaoDb: number;
    proporcaoSilencioPct: number;
    duracaoMediaPausasSeg: number;
    totalPausasLongas: number;
    velocidadeSilabasSeg: number;
    velocidadeLabel: ResumoMetricasVoz['velocidadeLabel'];
  };
}

export interface PreparedAudioSession {
  medidasAcusticas: MedidasAcusticasSessao;
  blocosPayload: GeminiBlockPayload[];
  baselineText: string;
}

/**
 * Pipeline completo no navegador:
 * 1. Decodifica o áudio via Web Audio API e normaliza para mono 16kHz.
 * 2. Calcula a linha de base e séries temporais da sessão.
 * 3. Divide em blocos de ~5 minutos nas pausas com 3s de sobreposição.
 * 4. Executa AudioAnalyzer (AnalyserNode) em cada segmento para extrair F0, RMS e pausas
 *    e prepara os payloads WAV base64 + resumo acústico para envio ao servidor proxy Gemini.
 */
export async function prepareGeminiSessionPayload(
  fileOrBlob: Blob,
  unlockedCtx?: AudioContext | null
): Promise<PreparedAudioSession> {
  const decoded = await decodeAndResampleAudio(fileOrBlob, unlockedCtx);
  const medidasAcusticas = computeAcousticMetrics(decoded.samples, decoded.sampleRate);

  if (!medidasAcusticas.temFalaDetectavel) {
    throw new Error('Áudio sem fala detectável. Verifique se a gravação contém voz audível.');
  }

  const blocks = splitAudioIntoBlocks(decoded.samples, decoded.sampleRate);
  const base = medidasAcusticas.linhaDeBase;
  const baselineText = [
    base.f0MediaHz ? `F0 média inicial ${base.f0MediaHz} Hz (±${base.f0VariacaoHz} Hz)` : 'F0 inicial indisponível',
    `volume inicial ${base.volumeMedioDb} dBFS (±${base.volumeVariacaoDb} dB)`,
    `silêncio inicial ${base.proporcaoSilencioPct}%`,
    `velocidade inicial ${base.velocidadeSilabasSeg} sílabas/s (${base.velocidadeLabel})`,
  ].join(', ');

  const analyzer = new AudioAnalyzer(2048);
  const blocosPayload: GeminiBlockPayload[] = [];

  for (const block of blocks) {
    const slice = decoded.samples.subarray(block.startSample, block.endSample);
    const segmentResult = await analyzer.analyzeAudioSegment(
      slice,
      decoded.sampleRate,
      block.index,
      block.startSec,
      block.endSec
    );
    const segMetrics = segmentResult.metrics;

    blocosPayload.push({
      block,
      acousticSummary: {
        qualidadeAudio: medidasAcusticas.qualidadeAudio,
        snrEstimadoDb: medidasAcusticas.snrEstimadoDb,
        f0MediaHz: segMetrics.f0MediaHz,
        f0VariacaoHz: segMetrics.f0VariacaoHz,
        volumeMedioDb: segMetrics.volumeMedioDb,
        volumeVariacaoDb: segMetrics.volumeVariacaoDb,
        proporcaoSilencioPct: segMetrics.proporcaoSilencioPct,
        duracaoMediaPausasSeg: segMetrics.duracaoMediaPausasSeg,
        totalPausasLongas: segMetrics.totalPausasLongas,
        velocidadeSilabasSeg: segMetrics.velocidadeSilabasSeg,
        velocidadeLabel: segMetrics.velocidadeLabel,
      },
    });
  }

  return {
    medidasAcusticas,
    blocosPayload,
    baselineText,
  };
}

