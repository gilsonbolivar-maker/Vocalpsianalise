import { useEffect, useRef, useState } from 'react';
import { ExportView } from './components/ExportView.tsx';
import { ProcessingScreen } from './components/ProcessingScreen.tsx';
import { QuickGuideModal } from './components/QuickGuideModal.tsx';
import { ResultsView } from './components/ResultsView.tsx';
import { RiskAlertBanner } from './components/RiskAlertBanner.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { type FictitiousCaseId, StartScreen } from './components/StartScreen.tsx';
import { TopBar } from './components/TopBar.tsx';
import type {
  AppScreen,
  BlocoAnaliseResponse,
  ResultadoTab,
  ResumoSessao,
  SegmentoAnalise,
  SessaoAnalisada,
} from './types/analysis.ts';
import { prepareGeminiSessionPayload } from './utils/acousticAnalysis.ts';
import {
  offsetMMSS,
  parseMMSSToSeconds,
  translateErrorToPortuguese,
  validateBlockResponse,
} from './utils/validation.ts';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('inicio');
  const [activeTab, setActiveTab] = useState<ResultadoTab>('transcricao');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);

  const [consentGiven, setConsentGiven] = useState(false);
  const [nonEmotionalNotes, setNonEmotionalNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingCaseId, setLoadingCaseId] = useState<FictitiousCaseId | null>(null);

  // Estado de processamento incremental
  const [processingFileName, setProcessingFileName] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [currentBlock, setCurrentBlock] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [partialSegments, setPartialSegments] = useState<SegmentoAnalise[]>([]);

  // Sessão atual apenas em memória (nunca salva em servidor)
  const [sessao, setSessao] = useState<SessaoAnalisada | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [highlightedTime, setHighlightedTime] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function handleClearSession() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setSessao(null);
    setPartialSegments([]);
    setHighlightedTime(null);
    setErrorMessage(null);
    setActiveTab('transcricao');
    setScreen('inicio');
  }

  function handleCancelProcessing() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPartialSegments([]);
    setScreen('inicio');
  }

  async function runAnalysisPipeline(file: File, unlockedCtx?: AudioContext | null) {
    if (!consentGiven) {
      setErrorMessage(
        'Confirme que o paciente foi informado e concordou com a gravação e a análise antes de prosseguir.'
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    const nextAudioUrl = URL.createObjectURL(file);
    setAudioUrl(nextAudioUrl);

    setErrorMessage(null);
    setProcessingFileName(file.name);
    setStageLabel('Calculando medidas objetivas da voz no aparelho...');
    setCurrentBlock(0);
    setTotalBlocks(0);
    setPartialSegments([]);
    setScreen('processando');

    try {
      const prepared = await prepareGeminiSessionPayload(file, unlockedCtx);
      if (controller.signal.aborted) return;

      const { medidasAcusticas, blocosPayload, baselineText } = prepared;
      setTotalBlocks(blocosPayload.length);

      const allSegments: SegmentoAnalise[] = [];
      const allNonEmotional = new Set<string>();
      const allQualityNotes = new Set<string>();
      let lastEndOffset = -1;

      for (const item of blocosPayload) {
        if (controller.signal.aborted) return;
        const { block, acousticSummary } = item;

        setCurrentBlock(block.index);
        setStageLabel(`Analisando bloco ${block.index} de ${block.total}...`);

        const res = await fetch('/api/analyze-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            audioBase64: block.wavBase64,
            mimeType: block.mimeType,
            blockIndex: block.index,
            totalBlocks: block.total,
            acousticSummary,
            baselineContext: block.index === 1 ? '' : baselineText,
            nonEmotionalNotes,
          }),
        });

        const rawJson = await res.json();
        if (!res.ok) {
          throw new Error(rawJson.error || 'Erro ao analisar o bloco de áudio.');
        }

        const checked = validateBlockResponse(rawJson);
        if (!checked.valid || !checked.parsed) {
          throw new Error(checked.reason || 'Dados retornados pela análise estão incompletos.');
        }

        const blockData: BlocoAnaliseResponse = checked.parsed;
        if (blockData.observacao_audio) {
          allQualityNotes.add(blockData.observacao_audio);
        }
        for (const f of blockData.fatores_nao_emocionais_identificados) {
          if (f.trim()) allNonEmotional.add(f.trim());
        }

        // Ajustar tempos para a linha do tempo absoluta da sessão e evitar duplicatas da sobreposição de 3s
        const offsetSec = Math.round(block.startSec);
        for (const seg of blockData.trechos) {
          const absInicio = offsetMMSS(seg.inicio, offsetSec);
          const absFim = offsetMMSS(seg.fim, offsetSec);
          const absStartSec = parseMMSSToSeconds(absInicio);

          if (block.index > 1 && absStartSec < lastEndOffset - 1.5) {
            continue;
          }

          allSegments.push({
            ...seg,
            inicio: absInicio,
            fim: absFim,
          });
          lastEndOffset = Math.max(lastEndOffset, parseMMSSToSeconds(absFim));
        }

        setPartialSegments([...allSegments]);
      }

      if (controller.signal.aborted) return;

      if (allSegments.length === 0) {
        throw new Error('Áudio sem fala detectável para compor a transcrição da sessão.');
      }

      // Gerar resumo clínico consolidado da sessão
      setStageLabel('Consolidando resumo de apoio da sessão...');
      let resumo: ResumoSessao | null = null;
      try {
        const sumRes = await fetch('/api/session-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            trechos: allSegments,
            medidasAcusticas,
            fatoresNaoEmocionais: Array.from(allNonEmotional),
            fatoresContextoInformados: nonEmotionalNotes,
          }),
        });
        if (sumRes.ok) {
          resumo = await sumRes.json();
        }
      } catch {
        // Caso o resumo falhe por erro transitório, os resultados principais continuam acessíveis
      }

      if (controller.signal.aborted) return;

      const novaSessao: SessaoAnalisada = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        criadoEm: new Date().toISOString(),
        nomeArquivo: file.name,
        duracaoSeg: medidasAcusticas.duracaoTotalSeg,
        fatoresContextoInformados: nonEmotionalNotes,
        medidasAcusticas,
        trechos: allSegments,
        fatoresNaoEmocionais: Array.from(allNonEmotional),
        observacoesQualidadeAudio: Array.from(allQualityNotes),
        resumo,
      };

      setSessao(novaSessao);
      setActiveTab('transcricao');
      setScreen('resultado');
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(translateErrorToPortuguese(err));
      setScreen('inicio');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  async function handleRunFictitiousCase(caseId: FictitiousCaseId) {
    if (!consentGiven) return;
    setErrorMessage(null);
    setLoadingCaseId(caseId);

    try {
      const res = await fetch('/api/test-case-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      });
      const data = await res.json();
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Não foi possível gerar o áudio do caso fictício.');
      }

      const blob = base64ToBlob(data.audioBase64, data.mimeType || 'audio/wav');
      const labelMap: Record<FictitiousCaseId, string> = {
        neutra: 'caso-ficticio-1-fala-neutra.wav',
        triste_pausas: 'caso-ficticio-2-fala-triste-pausas.wav',
        incongruencia_embargada: 'caso-ficticio-3-incongruencia-embargada.wav',
      };
      const file = new File([blob], labelMap[caseId], { type: 'audio/wav' });
      setLoadingCaseId(null);
      await runAnalysisPipeline(file);
    } catch (err) {
      setLoadingCaseId(null);
      setErrorMessage(translateErrorToPortuguese(err));
    }
  }

  const trechosRisco = sessao
    ? sessao.trechos.filter((t) => t.alerta_de_risco.status === 'sim')
    : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar
        screen={screen}
        hasSession={Boolean(sessao)}
        onNavigate={(next) => setScreen(next)}
        onOpenQuickGuide={() => setQuickGuideOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onClearSession={handleClearSession}
      />

      {sessao && screen !== 'inicio' && screen !== 'processando' && (
        <RiskAlertBanner
          trechosRisco={trechosRisco}
          onSelectTime={(inicio) => {
            setHighlightedTime(inicio);
            setActiveTab('transcricao');
            setScreen('resultado');
          }}
        />
      )}

      {screen === 'inicio' && (
        <StartScreen
          consentGiven={consentGiven}
          onConsentChange={setConsentGiven}
          nonEmotionalNotes={nonEmotionalNotes}
          onNonEmotionalNotesChange={setNonEmotionalNotes}
          onStartFileAnalysis={runAnalysisPipeline}
          onRunFictitiousCase={handleRunFictitiousCase}
          loadingCaseId={loadingCaseId}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
        />
      )}

      {screen === 'processando' && (
        <ProcessingScreen
          fileName={processingFileName}
          stageLabel={stageLabel}
          currentBlock={currentBlock}
          totalBlocks={totalBlocks}
          partialSegments={partialSegments}
          onCancel={handleCancelProcessing}
        />
      )}

      {screen === 'resultado' && sessao && (
        <ResultsView
          sessao={sessao}
          audioUrl={audioUrl}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onGoToExport={() => setScreen('exportar')}
          onOpenQuickGuide={() => setQuickGuideOpen(true)}
          highlightedTime={highlightedTime}
        />
      )}

      {screen === 'exportar' && sessao && (
        <ExportView sessao={sessao} onBackToResults={() => setScreen('resultado')} />
      )}

      <QuickGuideModal isOpen={quickGuideOpen} onClose={() => setQuickGuideOpen(false)} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
