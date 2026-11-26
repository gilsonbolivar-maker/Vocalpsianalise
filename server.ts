import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const ANALYSIS_MODEL = 'gemini-4-hydrogen';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';
const TTS_MODEL = 'gemini-3.8-flash-tts';

function getGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTransientRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const isTransient =
        msg.includes('503') ||
        msg.includes('unavailable') ||
        msg.includes('overloaded') ||
        msg.includes('temporarily');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

const BLOCK_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    qualidade_audio_percebida: {
      type: Type.STRING,
      enum: ['boa', 'moderada', 'baixa'],
      description: 'Qualidade geral do áudio percebida na escuta.',
    },
    observacao_audio: {
      type: Type.STRING,
      description: 'Observação curta sobre clareza, ruído, eco ou distância do microfone.',
    },
    fatores_nao_emocionais_identificados: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Possíveis fatores não emocionais que alteram a voz (ex.: sotaque, cansaço, gripe, medicação, ruído, prosódia atípica).',
    },
    trechos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          inicio: { type: Type.STRING, description: 'Tempo inicial no formato MM:SS relativo ao início deste bloco.' },
          fim: { type: Type.STRING, description: 'Tempo final no formato MM:SS relativo ao início deste bloco.' },
          falante: {
            type: Type.STRING,
            enum: ['Psicóloga', 'Paciente'],
            description: 'Quem está falando no trecho.',
          },
          transcricao: {
            type: Type.STRING,
            description: 'Transcrição fiel em português do Brasil, preservando hesitações e repetições.',
          },
          temas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Temas principais abordados no trecho.',
          },
          emocoes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                emocao: {
                  type: Type.STRING,
                  description:
                    'Uma das emoções: tristeza, ansiedade ou medo, raiva ou irritação, culpa ou vergonha, desesperança, apatia ou desânimo, alegria ou alívio, tensão, confusão, neutro.',
                },
                intensidade: {
                  type: Type.INTEGER,
                  description: 'Intensidade de 0 a 3 (0 ausente, 1 leve, 2 moderada, 3 intensa).',
                },
                confianca: {
                  type: Type.STRING,
                  enum: ['baixa', 'média', 'alta'],
                },
                evidencias_na_voz: {
                  type: Type.STRING,
                  description: 'Evidências concretas percebidas na voz (tom, ritmo, pausas, tremor, respiração).',
                },
              },
              required: ['emocao', 'intensidade', 'confianca', 'evidencias_na_voz'],
            },
          },
          marcadores_da_voz: {
            type: Type.OBJECT,
            properties: {
              tom: { type: Type.STRING },
              intensidade: { type: Type.STRING },
              velocidade: { type: Type.STRING },
              pausas: { type: Type.STRING },
              qualidade_da_voz: { type: Type.STRING },
              sinais_nao_verbais: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['tom', 'intensidade', 'velocidade', 'pausas', 'qualidade_da_voz', 'sinais_nao_verbais'],
          },
          congruencia: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                enum: ['combina', 'nao_combina'],
              },
              explicacao: {
                type: Type.STRING,
                description: 'Explicação em linguagem de hipótese sobre a congruência ou incongruência entre fala e voz.',
              },
            },
            required: ['status', 'explicacao'],
          },
          sinais_para_investigar: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                area: { type: Type.STRING },
                justificativa: { type: Type.STRING },
                pergunta_sugerida: { type: Type.STRING },
              },
              required: ['area', 'justificativa', 'pergunta_sugerida'],
            },
          },
          alerta_de_risco: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                enum: ['sim', 'não'],
              },
              motivo: { type: Type.STRING },
            },
            required: ['status', 'motivo'],
          },
        },
        required: [
          'inicio',
          'fim',
          'falante',
          'transcricao',
          'temas',
          'emocoes',
          'marcadores_da_voz',
          'congruencia',
          'sinais_para_investigar',
          'alerta_de_risco',
        ],
      },
    },
  },
  required: [
    'qualidade_audio_percebida',
    'observacao_audio',
    'fatores_nao_emocionais_identificados',
    'trechos',
  ],
};

const SUMMARY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    panorama_emocional: {
      type: Type.STRING,
      description: 'Um parágrafo curto em linguagem de hipótese resumindo o panorama emocional da sessão.',
    },
    momentos_chave: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tempo: { type: Type.STRING },
          descricao: { type: Type.STRING },
          evidencia_vocal: { type: Type.STRING },
        },
        required: ['tempo', 'descricao', 'evidencia_vocal'],
      },
    },
    comparacao_linha_de_base: {
      type: Type.STRING,
      description: 'Comparação da voz ao longo da sessão em relação aos primeiros minutos do próprio paciente.',
    },
    fatores_confundidores: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    perguntas_prioritarias: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          area: { type: Type.STRING },
          pergunta: { type: Type.STRING },
        },
        required: ['area', 'pergunta'],
      },
    },
  },
  required: [
    'panorama_emocional',
    'momentos_chave',
    'comparacao_linha_de_base',
    'fatores_confundidores',
    'perguntas_prioritarias',
  ],
};

function validateParsedBlock(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (
    obj.qualidade_audio_percebida !== 'boa' &&
    obj.qualidade_audio_percebida !== 'moderada' &&
    obj.qualidade_audio_percebida !== 'baixa'
  ) {
    return false;
  }
  if (typeof obj.observacao_audio !== 'string') return false;
  if (!Array.isArray(obj.fatores_nao_emocionais_identificados)) return false;
  if (!Array.isArray(obj.trechos)) return false;

  for (const t of obj.trechos) {
    if (!t || typeof t !== 'object') return false;
    const seg = t as Record<string, unknown>;
    if (typeof seg.inicio !== 'string' || !/^\d{1,3}:\d{2}$/.test(seg.inicio.trim())) return false;
    if (typeof seg.fim !== 'string' || !/^\d{1,3}:\d{2}$/.test(seg.fim.trim())) return false;
    if (seg.falante !== 'Psicóloga' && seg.falante !== 'Paciente') return false;
    if (typeof seg.transcricao !== 'string' || seg.transcricao.trim().length === 0) return false;
    if (!Array.isArray(seg.temas) || !Array.isArray(seg.emocoes) || !Array.isArray(seg.sinais_para_investigar)) {
      return false;
    }
    if (!seg.marcadores_da_voz || !seg.congruencia || !seg.alerta_de_risco) return false;
    const cong = seg.congruencia as Record<string, unknown>;
    if (cong.status !== 'combina' && cong.status !== 'nao_combina') return false;
    const risk = seg.alerta_de_risco as Record<string, unknown>;
    if (risk.status !== 'sim' && risk.status !== 'não') return false;
  }
  return true;
}

function classifyGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  console.error('[Vocalpsianalise API error]:', raw);
  const lower = raw.toLowerCase();

  if (raw === 'GEMINI_API_KEY_MISSING') {
    return {
      status: 500,
      message: 'Chave da API do Gemini não configurada no servidor (Secrets).',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Limite da API atingido no momento. Aguarde alguns segundos ou verifique a cota da conta.',
    };
  }
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: 'Chave da API inválida ou sem permissão. Verifique em Configurações > Secrets.',
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded')) {
    return {
      status: 503,
      message: 'O modelo de análise está temporariamente sobrecarregado. Tente novamente em alguns segundos.',
    };
  }
  return {
    status: 502,
    message: `Erro ao consultar o modelo de análise de áudio: ${raw}`,
  };
}

const SYSTEM_INSTRUCTION_ANALYSIS = `Você é um sistema especializado em análise vocal, prosódica e linguística para apoio clínico a psicólogas brasileiras (aplicativo Vocalpsianalise).

REGRAS ÉTICAS E CLÍNICAS OBRIGATÓRIAS:
1. NUNCA faça diagnóstico médico ou psicológico. Você levanta apenas hipóteses e sinais para a psicóloga investigar.
2. NUNCA afirme um sentimento como fato absoluto. Use sempre linguagem de hipótese: "a voz sugere", "há sinais de", "pode indicar", "parece haver".
3. TODA percepção emocional deve trazer evidências concretas na voz (ex.: "voz mais baixa e lenta, pausas longas antes de responder, leve tremor") e grau de confiança: "baixa", "média" ou "alta".
4. Separe quem fala entre "Psicóloga" e "Paciente". Se houver apenas uma voz falando como relato de sessão, identifique como "Paciente" (a menos que faça perguntas terapêuticas claras como psicóloga). Analise emoções, incongruências e sinais para investigar SOMENTE nas falas do "Paciente". Para falas da "Psicóloga", retorne emocoes: [], sinais_para_investigar: [], congruencia: { status: "combina", explicacao: "Fala da profissional." } e alerta_de_risco: { status: "não", motivo: "" }.
5. ESCUTE DIRETAMENTE O ÁUDIO (tom, entonação, intensidade, ritmo, pausas, qualidade da voz e sinais não verbais como choro, suspiro, riso nervoso, respiração ofegante, engolir seco, gaguejar, hesitações).
6. Analise as 3 camadas em cada trecho do Paciente:
   - Camada 1: Transcrição fiel em pt-BR (com hesitações) e temas principais.
   - Camada 2: Marcadores da voz (tom, intensidade, velocidade, pausas, qualidade_da_voz, sinais_nao_verbais).
   - Camada 3: Congruência entre o que é dito e como é dito ("combina" ou "nao_combina" com explicação em linguagem de hipótese). Ex.: diz "estou bem", mas a voz fica embargada e baixa.
7. Emoções possíveis (avalie as mais relevantes presentes, com intensidade 0 a 3):
   "tristeza", "ansiedade ou medo", "raiva ou irritação", "culpa ou vergonha", "desesperança", "apatia ou desânimo", "alegria ou alívio", "tensão", "confusão", "neutro".
8. CUIDADOS PARA NÃO ERRAR:
   - Use a linha de base do próprio paciente (primeiros minutos) para comparar mudanças; não compare com padrão genérico.
   - Considere e cite quando aplicável fatores não emocionais que alteram a voz: sotaque regional, jeito natural de falar, cansaço, gripe, medicação, condições como autismo, Parkinson ou depressão, ruído ambiente e qualidade da gravação.
   - Se o áudio estiver ruim, ruidoso ou abafado, informe isso e reduza a confiança para "baixa".
   - NÃO invente emoções em trechos curtos demais ou sem fala clara. Se não houver fala inteligível no áudio, retorne trechos: [].
9. SINAIS PARA INVESTIGAR:
   - Ligue os achados a áreas clínicas sem diagnosticar (ex.: humor, ansiedade, sono, energia, interesse e prazer, autoestima, concentração, irritabilidade, uso de substâncias, trauma, relações), com justificativa baseada em fala+voz e uma pergunta aberta sugerida para a próxima sessão.
10. ALERTA DE RISCO:
   - Se o paciente falar em morte, suicídio, se machucar, desesperança intensa ou falta de saída, OU se a voz e o conteúdo juntos indicarem desespero grave, marque alerta_de_risco.status = "sim" e explique o motivo com precisão. Caso contrário, status = "não" e motivo = "".
11. Responda ESTRITAMENTE no formato JSON solicitado, em português do Brasil.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Áudio ausente ou inválido para transcrição.' });
        return;
      }

      const ai = getGeminiClient('v1beta');
      const audioPart = {
        inlineData: {
          mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'audio/wav',
          data: audioBase64,
        },
      };

      const response = await withTransientRetry(() =>
        ai.models.generateContent({
          model: TRANSCRIBE_MODEL,
          contents: {
            parts: [
              audioPart,
              {
                text: 'Transcreva fielmente este áudio em português do Brasil, preservando pausas longas (...), hesitações e repetições.',
              },
            ],
          },
        })
      );

      const transcription = (response.text || '').trim();
      if (!transcription) {
        res.status(422).json({
          error: 'Áudio sem fala detectável para transcrição.',
        });
        return;
      }

      res.json({ transcription });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.message });
    }
  });

  app.post('/api/analyze-chunk', async (req, res) => {
    try {
      const {
        audioBase64,
        mimeType,
        blockIndex,
        totalBlocks,
        acousticSummary,
        baselineContext,
        nonEmotionalNotes,
        verbatimTranscript,
      } = req.body || {};

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Áudio do bloco ausente ou inválido.' });
        return;
      }

      const ai = getGeminiClient();

      const promptLines = [
        `Analise este bloco de áudio da sessão terapêutica (Bloco ${blockIndex || 1} de ${totalBlocks || 1}).`,
        'Os tempos inicio e fim de cada trecho devem ser relativos ao início deste bloco no formato MM:SS.',
        acousticSummary
          ? `Medidas acústicas objetivas calculadas localmente neste aparelho (Web Audio): ${JSON.stringify(acousticSummary)}`
          : '',
        baselineContext
          ? `Linha de base vocal dos primeiros minutos do paciente: ${baselineContext}. Compare mudanças vocais em relação a essa linha de base do próprio paciente.`
          : 'Este é o bloco inicial da sessão: observe atentamente os primeiros minutos da fala do paciente para estabelecer sua linha de base vocal natural.',
        nonEmotionalNotes
          ? `Fatores contextuais informados pela psicóloga: ${nonEmotionalNotes}.`
          : '',
        verbatimTranscript
          ? `Transcrição prévia de apoio (use o áudio diretamente para tom, pausas e emoções): ${verbatimTranscript}`
          : '',
        'Lembre-se: use apenas linguagem de hipótese, cite evidências concretas da voz e nunca diagnostique.',
      ]
        .filter(Boolean)
        .join('\n\n');

      const audioPart = {
        inlineData: {
          mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'audio/wav',
          data: audioBase64,
        },
      };

      const callModel = async (extraInstruction = '') => {
        const response = await withTransientRetry(() =>
          ai.models.generateContent({
            model: ANALYSIS_MODEL,
            contents: {
              parts: [
                audioPart,
                { text: extraInstruction ? `${promptLines}\n\nATENÇÃO: ${extraInstruction}` : promptLines },
              ],
            },
            config: {
              systemInstruction: SYSTEM_INSTRUCTION_ANALYSIS,
              responseMimeType: 'application/json',
              responseSchema: BLOCK_RESPONSE_SCHEMA,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            },
          })
        );
        const text = (response.text || '').trim();
        return JSON.parse(text);
      };

      let parsed: unknown = null;
      let valid = false;

      // Tentativa 1
      try {
        parsed = await callModel();
        valid = validateParsedBlock(parsed);
      } catch {
        valid = false;
      }

      // Se vier incompleto ou inválido, refaz a chamada uma vez conforme especificação
      if (!valid) {
        try {
          parsed = await callModel(
            'A resposta anterior veio incompleta. Garanta todos os campos obrigatórios do JSON válidos para cada trecho.'
          );
          valid = validateParsedBlock(parsed);
        } catch (retryErr) {
          const classified = classifyGeminiError(retryErr);
          res.status(classified.status).json({ error: classified.message });
          return;
        }
      }

      if (!valid) {
        res.status(502).json({
          error: 'O modelo retornou dados incompletos após nova tentativa. Tente analisar novamente.',
        });
        return;
      }

      res.json(parsed);
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.message });
    }
  });

  app.post('/api/session-summary', async (req, res) => {
    try {
      const { trechos, medidasAcusticas, fatoresNaoEmocionais, fatoresContextoInformados } =
        req.body || {};

      if (!Array.isArray(trechos) || trechos.length === 0) {
        res.status(400).json({ error: 'Não há trechos analisados para gerar o resumo.' });
        return;
      }

      const ai = getGeminiClient();
      const compactSegments = trechos.map((t: Record<string, unknown>) => ({
        inicio: t.inicio,
        fim: t.fim,
        falante: t.falante,
        transcricao: t.transcricao,
        emocoes: t.emocoes,
        congruencia: t.congruencia,
        sinais_para_investigar: t.sinais_para_investigar,
        alerta_de_risco: t.alerta_de_risco,
      }));

      const prompt = [
        'Com base nos trechos analisados e nas medidas acústicas abaixo, gere um resumo clínico de apoio em português do Brasil.',
        'Regras obrigatórias: não faça diagnóstico; use sempre linguagem de hipótese ("a voz sugere", "há sinais de", "pode indicar"); inclua um parágrafo curto de panorama emocional, os momentos-chave com tempo e evidência vocal, comparação com a linha de base inicial do paciente, fatores não emocionais/confundidores e perguntas prioritárias para a próxima sessão.',
        `Contexto informado: ${fatoresContextoInformados || 'Nenhum informado.'}`,
        `Fatores não emocionais observados: ${JSON.stringify(fatoresNaoEmocionais || [])}`,
        `Medidas acústicas objetivas (geral e linha de base): ${JSON.stringify({
          geral: medidasAcusticas?.geral,
          linhaDeBase: medidasAcusticas?.linhaDeBase,
          qualidadeAudio: medidasAcusticas?.qualidadeAudio,
        })}`,
        `Trechos da sessão: ${JSON.stringify(compactSegments)}`,
      ].join('\n\n');

      const response = await withTransientRetry(() =>
        ai.models.generateContent({
          model: ANALYSIS_MODEL,
          contents: prompt,
          config: {
            systemInstruction:
              'Você é um assistente de síntese clínica para psicólogas. Nunca diagnostique; escreva apenas hipóteses apoiadas em evidências vocais e verbais.',
            responseMimeType: 'application/json',
            responseSchema: SUMMARY_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.message });
    }
  });

  /**
   * Gera áudio falado real (WAV) em português do Brasil para os 3 casos fictícios de validação:
   * 1) neutra
   * 2) triste_pausas
   * 3) incongruencia_embargada
   */
  app.post('/api/test-case-audio', async (req, res) => {
    try {
      const { caseId } = req.body || {};

      let parts: Array<{ text: string; speechMetadata?: { speaker: string; style: string } }> = [];
      let plainPrompt = '';
      let speakerConfigs: Array<{
        speaker: string;
        voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
      }> = [];

      if (caseId === 'neutra') {
        parts = [
          {
            text: 'Como foi a sua semana desde a nossa última conversa?',
            speechMetadata: { speaker: 'Psicóloga', style: 'Calma, acolhedora, tom natural em português brasileiro' },
          },
          {
            text: 'Foi uma semana tranquila e bem organizada. Consegui entregar o relatório no trabalho na quarta-feira, dormi no meu horário habitual e fiz caminhada dois dias no parque. Senti que mantive uma rotina estável.',
            speechMetadata: { speaker: 'Paciente', style: 'Tom calmo, estável, ritmo regular, fala clara e neutra em português brasileiro' },
          },
        ];
        plainPrompt =
          'Foi uma semana tranquila e bem organizada. Consegui entregar o relatório no trabalho na quarta-feira, dormi no meu horário habitual e fiz caminhada dois dias no parque. Senti que mantive uma rotina estável.';
        speakerConfigs = [
          { speaker: 'Psicóloga', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          { speaker: 'Paciente', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        ];
      } else if (caseId === 'triste_pausas') {
        parts = [
          {
            text: 'O que tem pesado mais para você nesses últimos dias?',
            speechMetadata: { speaker: 'Psicóloga', style: 'Suave, empática, tom acolhedor em português brasileiro' },
          },
          {
            text: '<breath> Eu... eu acordo já sem força para levantar. ... Tudo parece exigir um esforço enorme... e parece que nada do que eu faço faz muita diferença mais. <breath> Às vezes eu só fico olhando para a parede esperando o dia passar.',
            speechMetadata: {
              speaker: 'Paciente',
              style: 'Voz baixa, lenta, cansada, com pausas longas, tom melancólico e abatido em português brasileiro',
            },
          },
        ];
        plainPrompt =
          '<breath> Eu... eu acordo já sem força para levantar. ... Tudo parece exigir um esforço enorme... e parece que nada do que eu faço faz muita diferença mais. <breath> Às vezes eu só fico olhando para a parede esperando o dia passar.';
        speakerConfigs = [
          { speaker: 'Psicóloga', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          { speaker: 'Paciente', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
        ];
      } else if (caseId === 'incongruencia_embargada') {
        parts = [
          {
            text: 'Quando você falou da reunião de família, percebi você respirando fundo. Como você está se sentindo agora?',
            speechMetadata: { speaker: 'Psicóloga', style: 'Gentil, atenta, ritmo calmo em português brasileiro' },
          },
          {
            text: '<breath> Não, eu estou ótima, sério, está tudo bem comigo. ... Não precisa se preocupar não, eu já superei isso... está tudo resolvido, eu estou realmente bem.',
            speechMetadata: {
              speaker: 'Paciente',
              style: 'Voz embargada, trêmula, quase chorando, volume baixo e hesitante apesar de dizer que está bem, em português brasileiro',
            },
          },
        ];
        plainPrompt =
          '<breath> Não... eu estou ótima, sério, está tudo bem comigo... Não precisa se preocupar não, eu já superei isso... está tudo resolvido, eu estou realmente bem.';
        speakerConfigs = [
          { speaker: 'Psicóloga', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          { speaker: 'Paciente', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        ];
      } else {
        res.status(400).json({ error: 'Caso de teste inválido.' });
        return;
      }

      let base64Audio: string | undefined;
      const aiAlpha = getGeminiClient('v1alpha');

      // Tentativa 1: v1alpha com multi-speaker + speechMetadata
      try {
        const response = await withTransientRetry(() =>
          aiAlpha.models.generateContent({
            model: TTS_MODEL,
            contents: [{ role: 'user', parts }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: speakerConfigs,
                },
              },
            },
          })
        );
        base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      } catch {
        // Fallback: v1alpha com falante único
        const fallbackResp = await withTransientRetry(() =>
          aiAlpha.models.generateContent({
            model: TTS_MODEL,
            contents: [{ role: 'user', parts: [{ text: plainPrompt }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
              },
            },
          })
        );
        base64Audio = fallbackResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      }

      if (!base64Audio) {
        res.status(502).json({ error: 'Não foi possível gerar o áudio do caso fictício.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err) {
      const classified = classifyGeminiError(err);
      res.status(classified.status).json({ error: classified.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vocalpsianalise rodando na porta ${PORT}`);
  });
  server.requestTimeout = 300000;
  server.headersTimeout = 310000;
  server.keepAliveTimeout = 65000;
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
