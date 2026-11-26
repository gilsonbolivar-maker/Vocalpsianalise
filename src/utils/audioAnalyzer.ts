import type { ResumoMetricasVoz } from '../types/analysis.ts';

export interface LiveAnalyserSnapshot {
  f0Hz: number | null;
  volumeDb: number;
  isSilence: boolean;
  levelPct: number;
}

export interface SegmentAnalyserResult {
  segmentIndex: number;
  startSec: number;
  endSec: number;
  metrics: ResumoMetricasVoz;
  analyserSampleCount: number;
}

/**
 * Utilitário AudioAnalyzer baseado na Web Audio API (AnalyserNode)
 * para extração de frequência fundamental (F0 / pitch), amplitude RMS (volume em dBFS),
 * detecção de pausas/silêncio e velocidade aproximada de fala por segmento de áudio.
 */
export class AudioAnalyzer {
  private analyser: AnalyserNode | null = null;
  private timeBuffer: Float32Array<ArrayBuffer> | null = null;
  private freqBuffer: Float32Array<ArrayBuffer> | null = null;
  private sampleRate = 16000;
  private noiseFloorDb = -48;

  constructor(fftSize = 2048) {
    this.fftSize = fftSize;
  }

  private readonly fftSize: number;

  /**
   * Conecta um AnalyserNode da Web Audio API a uma fonte ao vivo (microfone)
   * ou nó de áudio dentro de um AudioContext / OfflineAudioContext.
   */
  public attachToNode(
    context: BaseAudioContext,
    sourceNode: AudioNode,
    connectToDestination = false
  ): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = this.fftSize;
    analyser.smoothingTimeConstant = 0.15;

    sourceNode.connect(analyser);
    if (connectToDestination) {
      analyser.connect(context.destination);
    }

    this.analyser = analyser;
    this.sampleRate = context.sampleRate;
    this.timeBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.freqBuffer = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    return analyser;
  }

  public detach(): void {
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // Ignora caso já desconectado
      }
    }
    this.analyser = null;
    this.timeBuffer = null;
    this.freqBuffer = null;
  }

  /**
   * Lê um quadro instantâneo do AnalyserNode (tempo + frequência) para monitoramento ao vivo.
   */
  public readLiveSnapshot(): LiveAnalyserSnapshot {
    if (!this.analyser || !this.timeBuffer || !this.freqBuffer) {
      return { f0Hz: null, volumeDb: -60, isSilence: true, levelPct: 0 };
    }

    this.analyser.getFloatTimeDomainData(this.timeBuffer);
    this.analyser.getFloatFrequencyData(this.freqBuffer);

    const rms = AudioAnalyzer.computeRms(this.timeBuffer, 0, this.timeBuffer.length);
    const volumeDb = Number((20 * Math.log10(rms + 1e-7)).toFixed(1));
    const isSilence = volumeDb < this.noiseFloorDb;

    let f0Hz: number | null = null;
    if (!isSilence) {
      const est = AudioAnalyzer.estimatePitchAutocorrelation(
        this.timeBuffer,
        0,
        this.timeBuffer.length,
        this.sampleRate
      );
      if (est >= 75 && est <= 360) {
        f0Hz = Number(est.toFixed(1));
      }
    }

    const levelPct = Math.max(0, Math.min(100, Math.round(((volumeDb + 55) / 45) * 100)));
    return { f0Hz, volumeDb, isSilence, levelPct };
  }

  /**
   * Analisa um segmento de áudio (ex.: bloco de 5 minutos) usando OfflineAudioContext + AnalyserNode
   * para extrair F0 (pitch), amplitude RMS, proporção de silêncio/pausas e ritmo antes de enviar ao Gemini.
   */
  public async analyzeAudioSegment(
    samples: Float32Array,
    sampleRate: number,
    segmentIndex = 1,
    startSec = 0,
    endSec?: number
  ): Promise<SegmentAnalyserResult> {
    const durationSec = samples.length / sampleRate;
    const resolvedEndSec = endSec ?? startSec + durationSec;

    let analyserSampleCount = 0;
    const analyserF0Samples: number[] = [];
    const analyserDbSamples: number[] = [];

    // Passagem via OfflineAudioContext + AnalyserNode quando disponível no navegador
    if (typeof OfflineAudioContext !== 'undefined' && samples.length > 512) {
      try {
        const offline = new OfflineAudioContext(1, samples.length, sampleRate);
        const audioBuffer = offline.createBuffer(1, samples.length, sampleRate);
        audioBuffer.getChannelData(0).set(samples);

        const source = offline.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = this.attachToNode(offline, source, true);
        const timeBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

        // Amostragem com AnalyserNode via suspend() em intervalos regulares (~0.5s, máx ~300 pontos por bloco)
        const stepSec = Math.max(0.25, durationSec / 300);
        for (let t = 0.08; t < durationSec - 0.05; t += stepSec) {
          const captureTime = t;
          offline
            .suspend(captureTime)
            .then(() => {
              analyser.getFloatTimeDomainData(timeBuf);
              const rms = AudioAnalyzer.computeRms(timeBuf, 0, timeBuf.length);
              const db = 20 * Math.log10(rms + 1e-7);
              analyserDbSamples.push(db);
              if (db > -45) {
                const f0 = AudioAnalyzer.estimatePitchAutocorrelation(
                  timeBuf,
                  0,
                  timeBuf.length,
                  sampleRate
                );
                if (f0 >= 75 && f0 <= 360) {
                  analyserF0Samples.push(f0);
                }
              }
              analyserSampleCount++;
            })
            .catch(() => {})
            .finally(() => {
              offline.resume().catch(() => {});
            });
        }

        source.start(0);
        await offline.startRendering();
        this.detach();
      } catch {
        this.detach();
      }
    }

    // Extração contínua de alta resolução (quadros de 30ms / passo 15ms) para detecção precisa de pausas e sílabas
    const metrics = AudioAnalyzer.computeHighResolutionMetrics(
      samples,
      sampleRate,
      analyserF0Samples,
      analyserDbSamples
    );

    return {
      segmentIndex,
      startSec: Number(startSec.toFixed(1)),
      endSec: Number(resolvedEndSec.toFixed(1)),
      metrics,
      analyserSampleCount,
    };
  }

  public static computeRms(
    samples: Float32Array,
    start: number,
    length: number
  ): number {
    let sumSq = 0;
    const end = Math.min(samples.length, start + length);
    const count = Math.max(1, end - start);
    for (let i = start; i < end; i++) {
      const v = samples[i];
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / count);
  }

  public static estimatePitchAutocorrelation(
    samples: Float32Array,
    start: number,
    frameLen: number,
    sampleRate: number
  ): number {
    const minLag = Math.floor(sampleRate / 360);
    const maxLag = Math.floor(sampleRate / 75);
    const maxCheck = Math.min(frameLen, samples.length - start - maxLag);
    if (maxCheck <= minLag) return 0;

    let energy0 = 0;
    for (let i = 0; i < maxCheck; i++) {
      const v = samples[start + i];
      energy0 += v * v;
    }
    if (energy0 < 1e-6) return 0;

    let bestLag = 0;
    let bestNormCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let cross = 0;
      let energyLag = 0;
      for (let i = 0; i < maxCheck; i++) {
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

  public static computeHighResolutionMetrics(
    samples: Float32Array,
    sampleRate: number,
    extraAnalyserF0: number[] = [],
    extraAnalyserDb: number[] = []
  ): ResumoMetricasVoz {
    const frameLen = Math.floor(0.03 * sampleRate);
    const hopLen = Math.floor(0.015 * sampleRate);
    const frameStepSec = hopLen / sampleRate;
    const numFrames = Math.max(1, Math.floor((samples.length - frameLen) / hopLen));

    const frameDb = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      const rms = AudioAnalyzer.computeRms(samples, f * hopLen, frameLen);
      frameDb[f] = 20 * Math.log10(rms + 1e-7);
    }

    const sortedDb = Float32Array.from(frameDb).sort();
    const noiseFloorDb = sortedDb[Math.floor(sortedDb.length * 0.1)] ?? -60;
    const speechThresholdDb = Math.max(-52, Math.min(-24, noiseFloorDb + 7));

    const voicedFlags = new Uint8Array(numFrames);
    const f0Values: number[] = [...extraAnalyserF0];
    const voicedDbValues: number[] = [];

    let silentFrames = 0;
    let currentSilentRun = 0;
    const pauseDurations: number[] = [];

    for (let f = 0; f < numFrames; f++) {
      if (frameDb[f] > speechThresholdDb) {
        voicedFlags[f] = 1;
        voicedDbValues.push(frameDb[f]);
        const f0 = AudioAnalyzer.estimatePitchAutocorrelation(
          samples,
          f * hopLen,
          frameLen,
          sampleRate
        );
        if (f0 >= 75 && f0 <= 360) {
          f0Values.push(f0);
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

    // F0 stats com filtro interquartil
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

    // Volume stats (combina quadros vozeados com leituras do AnalyserNode quando houver poucos quadros)
    const dbSource =
      voicedDbValues.length > 0
        ? voicedDbValues
        : extraAnalyserDb.filter((d) => d > speechThresholdDb);
    let volumeMedioDb = -50;
    let volumeVariacaoDb = 0;
    if (dbSource.length > 0) {
      const meanDb = dbSource.reduce((a, b) => a + b, 0) / dbSource.length;
      const stdDb = Math.sqrt(
        dbSource.reduce((a, b) => a + (b - meanDb) ** 2, 0) / dbSource.length
      );
      volumeMedioDb = Number(meanDb.toFixed(1));
      volumeVariacaoDb = Number(stdDb.toFixed(1));
    }

    const proporcaoSilencioPct = Number(((silentFrames / numFrames) * 100).toFixed(1));
    const duracaoMediaPausasSeg =
      pauseDurations.length > 0
        ? Number((pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length).toFixed(2))
        : 0;
    const totalPausasLongas = pauseDurations.filter((d) => d >= 1.5).length;

    // Velocidade aproximada (núcleos silábicos por segundo)
    const minPeakGapFrames = Math.max(4, Math.floor(0.11 / frameStepSec));
    let syllablePeaks = 0;
    let lastPeakFrame = -minPeakGapFrames;

    for (let f = 2; f < numFrames - 2; f++) {
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
}
