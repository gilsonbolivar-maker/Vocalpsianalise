// Roda em segundo plano: carrega o modelo de voz e transforma áudio em texto.
// O áudio nunca sai do aparelho. Da internet vem só o modelo, uma vez.
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

type Msg =
  | { tipo: 'carregar'; modelo: string; simular?: boolean }
  | { tipo: 'transcrever'; id: number; audio: Float32Array; segundos: number };

let transcritor: any = null;
let simular = false;
let dispositivo = 'wasm';

async function temWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.tipo === 'carregar') {
    simular = !!m.simular;
    if (simular) {
      postMessage({ tipo: 'pronto', dispositivo: 'simulado' });
      return;
    }
    try {
      dispositivo = (await temWebGPU()) ? 'webgpu' : 'wasm';
      const dtype = dispositivo === 'webgpu'
        ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
        : 'q8';
      transcritor = await pipeline('automatic-speech-recognition', m.modelo, {
        device: dispositivo as any,
        dtype: dtype as any,
        progress_callback: (p: any) => {
          if (p.status === 'progress' && p.total) {
            postMessage({ tipo: 'progresso', arquivo: p.file, carregado: p.loaded, total: p.total });
          }
        },
      });
      postMessage({ tipo: 'pronto', dispositivo });
    } catch (err) {
      postMessage({ tipo: 'erro', mensagem: String((err as Error)?.message || err) });
    }
    return;
  }
  if (m.tipo === 'transcrever') {
    try {
      if (simular) {
        await new Promise(r => setTimeout(r, 300));
        postMessage({ tipo: 'texto', id: m.id, texto: `[trecho simulado de ${m.segundos.toFixed(1)} s]` });
        return;
      }
      const saida = await transcritor(m.audio, { language: 'portuguese', task: 'transcribe' });
      const texto = Array.isArray(saida) ? saida.map((s: any) => s.text).join(' ') : saida.text;
      postMessage({ tipo: 'texto', id: m.id, texto: (texto || '').trim() });
    } catch (err) {
      postMessage({ tipo: 'texto', id: m.id, texto: '', erro: String((err as Error)?.message || err) });
    }
  }
};
