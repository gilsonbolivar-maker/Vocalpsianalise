// Divide a fala em trechos, cortando de preferência numa pausa,
// para não partir palavras no meio.

export const TAXA = 16000;
const JANELA = Math.round(0.3 * TAXA); // 300 ms
const MIN_S = 8;
const IDEAL_S = 10;
const MAX_S = 25;
const SILENCIO = 0.012;

export function rms(a: Float32Array, ini = 0, fim = a.length): number {
  let s = 0;
  for (let i = ini; i < fim; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, fim - ini));
}

/** Procura a janela mais silenciosa entre ini e fim. Devolve o meio dela e o volume. */
function maisSilenciosa(a: Float32Array, ini: number, fim: number) {
  let melhor = { pos: fim, vol: Infinity };
  const passo = Math.round(JANELA / 3);
  for (let p = ini; p + JANELA <= fim; p += passo) {
    const v = rms(a, p, p + JANELA);
    if (v < melhor.vol) melhor = { pos: p + Math.round(JANELA / 2), vol: v };
  }
  return melhor;
}

/**
 * Decide onde cortar o áudio acumulado.
 * Devolve a posição do corte, ou null se ainda é cedo para cortar.
 */
export function pontoDeCorte(buf: Float32Array, forcar = false): number | null {
  const n = buf.length;
  if (forcar) return n > 0 ? n : null;
  if (n < IDEAL_S * TAXA) return null;
  if (n >= MAX_S * TAXA) return maisSilenciosa(buf, MIN_S * TAXA, MAX_S * TAXA).pos;
  const m = maisSilenciosa(buf, MIN_S * TAXA, n);
  return m.vol < SILENCIO ? m.pos : null;
}

/** Trechos quase mudos fazem o modelo inventar frases; é melhor pular. */
export function ehQuaseSilencio(a: Float32Array): boolean {
  return rms(a) < 0.004;
}

const FRASES_FANTASMA = [
  'legendas pela comunidade amara.org',
  'obrigado.',
  'obrigada.',
  'tchau.',
  'tchau, tchau.',
  'legendas pela comunidade amara.org.',
];

/** Remove frases que o modelo costuma inventar quando há pouco som. */
export function limparTexto(t: string): string {
  const s = t.trim();
  if (FRASES_FANTASMA.includes(s.toLowerCase())) return '';
  return s;
}

/** Reduz a taxa de amostragem, quando o aparelho não aceita gravar direto em 16 kHz. */
export function reduzirTaxa(a: Float32Array, taxaOrigem: number): Float32Array {
  if (taxaOrigem === TAXA) return a;
  const razao = taxaOrigem / TAXA;
  const n = Math.floor(a.length / razao);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ini = Math.floor(i * razao);
    const fim = Math.min(a.length, Math.floor((i + 1) * razao));
    let s = 0;
    for (let j = ini; j < fim; j++) s += a[j];
    out[i] = s / Math.max(1, fim - ini);
  }
  return out;
}

/** Empacota o trecho em WAV (16 kHz, mono, 16 bits), o formato aceito pela transcrição na nuvem. */
export function paraWav(a: Float32Array, taxa = TAXA): Blob {
  const buf = new ArrayBuffer(44 + a.length * 2);
  const v = new DataView(buf);
  const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + a.length * 2, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, a.length * 2, true);
  for (let i = 0; i < a.length; i++) {
    const s = Math.max(-1, Math.min(1, a[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
