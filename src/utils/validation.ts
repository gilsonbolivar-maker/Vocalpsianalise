import type { BlocoAnaliseResponse, SegmentoAnalise } from '../types/analysis.ts';

export const ALLOWED_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.aac', '.webm', '.ogg', '.mp4'];

export const ALLOWED_MIME_PREFIXES = [
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aac',
  'audio/aacp',
  'audio/webm',
  'audio/ogg',
  'video/webm',
  'video/mp4',
];

export const MAX_DURATION_SECONDS = 60 * 60; // 60 minutos

export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  if (!file || file.size === 0) {
    return {
      valid: false,
      error: 'Arquivo inválido ou vazio. Escolha uma gravação válida em m4a, mp3, wav ou aac.',
    };
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const mime = (file.type || '').toLowerCase();
  const hasAllowedMime =
    mime === '' || ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));

  if (!hasAllowedExtension && !hasAllowedMime) {
    return {
      valid: false,
      error:
        'Formato de arquivo não aceito. Escolha uma gravação no formato m4a, mp3, wav ou aac.',
    };
  }

  if (file.size > 450 * 1024 * 1024) {
    return {
      valid: false,
      error: 'O arquivo excede o tamanho máximo suportado (450 MB) para processamento no navegador.',
    };
  }

  return { valid: true };
}

export function formatSecondsToMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseMMSSToSeconds(mmss: string): number {
  const match = /^(\d{1,3}):(\d{2})$/.exec((mmss || '').trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function offsetMMSS(mmss: string, offsetSeconds: number): string {
  const base = parseMMSSToSeconds(mmss);
  return formatSecondsToMMSS(base + offsetSeconds);
}

export function isValidSegment(seg: unknown): seg is SegmentoAnalise {
  if (!seg || typeof seg !== 'object') return false;
  const s = seg as Record<string, unknown>;

  if (typeof s.inicio !== 'string' || !/^\d{1,3}:\d{2}$/.test(s.inicio.trim())) return false;
  if (typeof s.fim !== 'string' || !/^\d{1,3}:\d{2}$/.test(s.fim.trim())) return false;
  if (s.falante !== 'Psicóloga' && s.falante !== 'Paciente') return false;
  if (typeof s.transcricao !== 'string' || s.transcricao.trim().length === 0) return false;
  if (!Array.isArray(s.temas)) return false;
  if (!Array.isArray(s.emocoes)) return false;

  for (const emo of s.emocoes) {
    if (!emo || typeof emo !== 'object') return false;
    const e = emo as Record<string, unknown>;
    if (typeof e.emocao !== 'string') return false;
    if (typeof e.intensidade !== 'number' || e.intensidade < 0 || e.intensidade > 3) return false;
    if (e.confianca !== 'baixa' && e.confianca !== 'média' && e.confianca !== 'alta') return false;
    if (typeof e.evidencias_na_voz !== 'string') return false;
  }

  if (!s.marcadores_da_voz || typeof s.marcadores_da_voz !== 'object') return false;
  const m = s.marcadores_da_voz as Record<string, unknown>;
  if (
    typeof m.tom !== 'string' ||
    typeof m.intensidade !== 'string' ||
    typeof m.velocidade !== 'string' ||
    typeof m.pausas !== 'string' ||
    typeof m.qualidade_da_voz !== 'string' ||
    !Array.isArray(m.sinais_nao_verbais)
  ) {
    return false;
  }

  if (!s.congruencia || typeof s.congruencia !== 'object') return false;
  const c = s.congruencia as Record<string, unknown>;
  if (c.status !== 'combina' && c.status !== 'nao_combina') return false;
  if (typeof c.explicacao !== 'string') return false;

  if (!Array.isArray(s.sinais_para_investigar)) return false;
  for (const sig of s.sinais_para_investigar) {
    if (!sig || typeof sig !== 'object') return false;
    const si = sig as Record<string, unknown>;
    if (
      typeof si.area !== 'string' ||
      typeof si.justificativa !== 'string' ||
      typeof si.pergunta_sugerida !== 'string'
    ) {
      return false;
    }
  }

  if (!s.alerta_de_risco || typeof s.alerta_de_risco !== 'object') return false;
  const r = s.alerta_de_risco as Record<string, unknown>;
  if (r.status !== 'sim' && r.status !== 'não') return false;
  if (typeof r.motivo !== 'string') return false;

  return true;
}

export function validateBlockResponse(data: unknown): {
  valid: boolean;
  parsed?: BlocoAnaliseResponse;
  reason?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Resposta não é um objeto JSON.' };
  }
  const obj = data as Record<string, unknown>;
  if (
    obj.qualidade_audio_percebida !== 'boa' &&
    obj.qualidade_audio_percebida !== 'moderada' &&
    obj.qualidade_audio_percebida !== 'baixa'
  ) {
    return { valid: false, reason: 'Campo qualidade_audio_percebida inválido.' };
  }
  if (typeof obj.observacao_audio !== 'string') {
    return { valid: false, reason: 'Campo observacao_audio ausente.' };
  }
  if (!Array.isArray(obj.fatores_nao_emocionais_identificados)) {
    return { valid: false, reason: 'Campo fatores_nao_emocionais_identificados inválido.' };
  }
  if (!Array.isArray(obj.trechos)) {
    return { valid: false, reason: 'Campo trechos não é uma lista.' };
  }

  for (let i = 0; i < obj.trechos.length; i++) {
    if (!isValidSegment(obj.trechos[i])) {
      return { valid: false, reason: `Trecho ${i + 1} está incompleto ou inválido.` };
    }
  }

  return { valid: true, parsed: obj as unknown as BlocoAnaliseResponse };
}

export function translateErrorToPortuguese(err: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
  }

  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network')) {
    return 'Não foi possível conectar ao servidor de análise. Verifique sua conexão com a internet.';
  }
  if (lower.includes('429') || lower.includes('limite') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return 'Limite da API atingido no momento. Aguarde alguns instantes ou verifique a cota da conta.';
  }
  if (lower.includes('api_key') || lower.includes('403') || lower.includes('permission_denied')) {
    return 'Chave da API ausente ou sem permissão. Verifique a configuração em Secrets do AI Studio.';
  }
  if (lower.includes('sem fala') || lower.includes('nenhuma fala')) {
    return 'Áudio sem fala detectável. Verifique se a gravação contém voz audível.';
  }
  if (lower.includes('decode') || lower.includes('decodificar') || lower.includes('encodingerror')) {
    return 'Arquivo de áudio inválido ou corrompido. Use um arquivo m4a, mp3, wav ou aac válido.';
  }

  return msg || 'Ocorreu um erro inesperado ao processar o áudio.';
}
