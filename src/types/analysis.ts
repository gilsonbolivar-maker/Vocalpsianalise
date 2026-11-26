export type ConfiancaNivel = 'baixa' | 'média' | 'alta';

export type FalanteTipo = 'Psicóloga' | 'Paciente';

export type EmocaoNome =
  | 'tristeza'
  | 'ansiedade ou medo'
  | 'raiva ou irritação'
  | 'culpa ou vergonha'
  | 'desesperança'
  | 'apatia ou desânimo'
  | 'alegria ou alívio'
  | 'tensão'
  | 'confusão'
  | 'neutro';

export interface EmocaoItem {
  emocao: EmocaoNome | string;
  intensidade: number; // 0 a 3
  confianca: ConfiancaNivel;
  evidencias_na_voz: string;
}

export interface MarcadoresVoz {
  tom: string;
  intensidade: string;
  velocidade: string;
  pausas: string;
  qualidade_da_voz: string;
  sinais_nao_verbais: string[];
}

export interface Congruencia {
  status: 'combina' | 'nao_combina';
  explicacao: string;
}

export interface SinalInvestigar {
  area: string;
  justificativa: string;
  pergunta_sugerida: string;
}

export interface AlertaRisco {
  status: 'sim' | 'não';
  motivo: string;
}

export interface SegmentoAnalise {
  inicio: string; // MM:SS
  fim: string; // MM:SS
  falante: FalanteTipo;
  transcricao: string;
  temas: string[];
  emocoes: EmocaoItem[];
  marcadores_da_voz: MarcadoresVoz;
  congruencia: Congruencia;
  sinais_para_investigar: SinalInvestigar[];
  alerta_de_risco: AlertaRisco;
}

export interface JanelaAcustica {
  inicioSeg: number;
  fimSeg: number;
  tempoLabel: string;
  f0MediaHz: number | null;
  volumeMedioDb: number;
  silencioPct: number;
  velocidadeSilabasSeg: number;
}

export interface ResumoMetricasVoz {
  f0MediaHz: number | null;
  f0VariacaoHz: number | null;
  f0MinHz: number | null;
  f0MaxHz: number | null;
  volumeMedioDb: number;
  volumeVariacaoDb: number;
  proporcaoSilencioPct: number;
  duracaoMediaPausasSeg: number;
  totalPausasLongas: number;
  velocidadeSilabasSeg: number;
  velocidadeLabel: 'lenta' | 'normal' | 'acelerada';
}

export interface MedidasAcusticasSessao {
  duracaoTotalSeg: number;
  temFalaDetectavel: boolean;
  qualidadeAudio: 'boa' | 'moderada' | 'baixa';
  snrEstimadoDb: number;
  taxaClippingPct: number;
  observacoesQualidade: string[];
  geral: ResumoMetricasVoz;
  linhaDeBase: ResumoMetricasVoz;
  janelas: JanelaAcustica[];
}

export interface BlocoAnaliseResponse {
  qualidade_audio_percebida: 'boa' | 'moderada' | 'baixa';
  observacao_audio: string;
  fatores_nao_emocionais_identificados: string[];
  trechos: SegmentoAnalise[];
}

export interface ResumoSessao {
  panorama_emocional: string;
  momentos_chave: Array<{
    tempo: string;
    descricao: string;
    evidencia_vocal: string;
  }>;
  comparacao_linha_de_base: string;
  fatores_confundidores: string[];
  perguntas_prioritarias: Array<{
    area: string;
    pergunta: string;
  }>;
}

export interface SessaoAnalisada {
  id: string;
  criadoEm: string;
  nomeArquivo: string;
  duracaoSeg: number;
  fatoresContextoInformados: string;
  medidasAcusticas: MedidasAcusticasSessao;
  trechos: SegmentoAnalise[];
  fatoresNaoEmocionais: string[];
  observacoesQualidadeAudio: string[];
  resumo: ResumoSessao | null;
}

export type AppScreen = 'inicio' | 'processando' | 'resultado' | 'exportar';

export type ResultadoTab =
  | 'transcricao'
  | 'emocoes'
  | 'voz'
  | 'incongruencias'
  | 'sinais'
  | 'resumo';
