import { useRef, useState } from 'react';
import { BookOpen, FileDown, Info } from 'lucide-react';
import type { ResultadoTab, SessaoAnalisada } from '../types/analysis.ts';
import { formatSecondsToMMSS, parseMMSSToSeconds } from '../utils/validation.ts';
import { EmotionsTab } from './tabs/EmotionsTab.tsx';
import { IncongruencesTab } from './tabs/IncongruencesTab.tsx';
import { SignalsTab } from './tabs/SignalsTab.tsx';
import { SummaryTab } from './tabs/SummaryTab.tsx';
import { TranscriptTab } from './tabs/TranscriptTab.tsx';
import { VoiceMetricsTab } from './tabs/VoiceMetricsTab.tsx';

interface ResultsViewProps {
  sessao: SessaoAnalisada;
  audioUrl: string | null;
  activeTab: ResultadoTab;
  onTabChange: (tab: ResultadoTab) => void;
  onGoToExport: () => void;
  onOpenQuickGuide: () => void;
  highlightedTime: string | null;
}

const TABS: Array<{ id: ResultadoTab; label: string }> = [
  { id: 'transcricao', label: 'Transcrição' },
  { id: 'emocoes', label: 'Emoções na voz' },
  { id: 'voz', label: 'Voz' },
  { id: 'incongruencias', label: 'Incongruências' },
  { id: 'sinais', label: 'Sinais para investigar' },
  { id: 'resumo', label: 'Resumo' },
];

export function ResultsView({
  sessao,
  audioUrl,
  activeTab,
  onTabChange,
  onGoToExport,
  onOpenQuickGuide,
  highlightedTime,
}: ResultsViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [seekNotice, setSeekNotice] = useState<string | null>(null);

  function handlePlayAtTime(mmss: string) {
    const el = audioRef.current;
    if (!el) return;
    const seconds = parseMMSSToSeconds(mmss);
    el.currentTime = seconds;
    el.play().catch(() => {});
    setSeekNotice(`Reproduzindo a partir de ${mmss}`);
  }

  const incongCount = sessao.trechos.filter(
    (t) => t.falante === 'Paciente' && t.congruencia.status === 'nao_combina'
  ).length;
  const signalsCount = sessao.trechos.reduce(
    (acc, t) => acc + (t.falante === 'Paciente' ? t.sinais_para_investigar.length : 0),
    0
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Aviso ético obrigatório em toda tela de resultado */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-amber-950">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden="true" />
          <p className="text-base font-semibold">
            Documento de apoio. Hipóteses a confirmar pelo profissional responsável.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenQuickGuide}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-amber-50 whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-4 w-4 text-teal-700" aria-hidden="true" />
            <span>Guia rápido</span>
          </button>

          <button
            type="button"
            onClick={onGoToExport}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            <span>Exportar relatório</span>
          </button>
        </div>
      </div>

      {/* Cabeçalho da sessão + Player local */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{sessao.nomeArquivo}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 tabular-nums">
              <span>Duração: {formatSecondsToMMSS(sessao.duracaoSeg)}</span>
              <span aria-hidden="true">·</span>
              <span>{sessao.trechos.length} trechos analisados</span>
              <span aria-hidden="true">·</span>
              <span>{incongCount} incongruências</span>
              <span aria-hidden="true">·</span>
              <span>{signalsCount} sinais para investigar</span>
            </div>
          </div>

          {audioUrl && (
            <div className="flex flex-col gap-1 lg:w-96">
              <audio ref={audioRef} controls src={audioUrl} className="w-full" />
              {seekNotice && <p className="text-xs text-teal-800">{seekNotice}</p>}
            </div>
          )}
        </div>
      </section>

      {/* Navegação por abas (toque amplo para iPad e celular) */}
      <div
        role="tablist"
        aria-label="Seções da análise"
        className="mb-6 flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`min-h-[48px] rounded-xl px-4 py-2.5 text-base font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da aba ativa */}
      <div role="tabpanel">
        {activeTab === 'transcricao' && (
          <TranscriptTab
            trechos={sessao.trechos}
            hasAudio={Boolean(audioUrl)}
            onPlayAtTime={handlePlayAtTime}
            highlightedTime={highlightedTime}
          />
        )}
        {activeTab === 'emocoes' && <EmotionsTab trechos={sessao.trechos} />}
        {activeTab === 'voz' && (
          <VoiceMetricsTab
            medidas={sessao.medidasAcusticas}
            fatoresNaoEmocionais={sessao.fatoresNaoEmocionais}
            fatoresContextoInformados={sessao.fatoresContextoInformados}
            observacoesQualidade={sessao.observacoesQualidadeAudio}
          />
        )}
        {activeTab === 'incongruencias' && (
          <IncongruencesTab
            trechos={sessao.trechos}
            hasAudio={Boolean(audioUrl)}
            onPlayAtTime={handlePlayAtTime}
          />
        )}
        {activeTab === 'sinais' && (
          <SignalsTab
            trechos={sessao.trechos}
            hasAudio={Boolean(audioUrl)}
            onPlayAtTime={handlePlayAtTime}
          />
        )}
        {activeTab === 'resumo' && (
          <SummaryTab resumo={sessao.resumo} trechos={sessao.trechos} />
        )}
      </div>

      {/* Rodapé ético persistente */}
      <footer className="mt-10 border-t border-slate-200 pt-5 text-center text-sm font-medium text-slate-600">
        Documento de apoio. Hipóteses a confirmar pelo profissional responsável.
      </footer>
    </main>
  );
}
