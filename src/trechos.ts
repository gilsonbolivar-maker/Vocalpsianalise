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
