import { useEffect, useRef, useState } from 'react';
import { FileAudio, FlaskConical, Loader2, Mic, Square, Upload } from 'lucide-react';
import { AudioAnalyzer } from '../utils/audioAnalyzer.ts';
import { translateErrorToPortuguese, validateAudioFile } from '../utils/validation.ts';

export type FictitiousCaseId = 'neutra' | 'triste_pausas' | 'incongruencia_embargada';

interface StartScreenProps {
  consentGiven: boolean;
  onConsentChange: (checked: boolean) => void;
  nonEmotionalNotes: string;
  onNonEmotionalNotesChange: (val: string) => void;
  onStartFileAnalysis: (file: File, unlockedCtx?: AudioContext | null) => void;
  onRunFictitiousCase: (caseId: FictitiousCaseId) => void;
  loadingCaseId: FictitiousCaseId | null;
  errorMessage: string | null;
  onClearError: () => void;
}

export function StartScreen({
  consentGiven,
  onConsentChange,
  nonEmotionalNotes,
  onNonEmotionalNotesChange,
  onStartFileAnalysis,
  onRunFictitiousCase,
  loadingCaseId,
  errorMessage,
  onClearError,
}: StartScreenProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Gravação ao vivo (experimental) com suporte ao Safari iPad/iOS
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [liveTelemetry, setLiveTelemetry] = useState<{
    f0Hz: number | null;
    volumeDb: number;
    isSilence: boolean;
  } | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<{
    file: File;
    ctx: AudioContext | null;
  } | null>(null);
  const [isTranscribingMic, setIsTranscribingMic] = useState(false);
  const [micTranscript, setMicTranscript] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
    };
  }, []);

  function cleanupRecordingResources() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (liveAnalyzerRef.current) {
      liveAnalyzerRef.current.detach();
      liveAnalyzerRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    onClearError();
    setLocalError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateAudioFile(file);
    if (!check.valid) {
      setLocalError(check.error || 'Arquivo inválido.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  function handleAnalyzeSelectedFile() {
    if (!consentGiven || !selectedFile) return;
    onClearError();
    setLocalError(null);

    // Desbloqueia AudioContext diretamente no evento de toque (Safari iOS/iPad)
    let unlockedCtx: AudioContext | null = null;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        unlockedCtx = new AudioCtx();
        if (unlockedCtx.state === 'suspended') {
          unlockedCtx.resume().catch(() => {});
        }
      }
    } catch {
      unlockedCtx = null;
    }

    onStartFileAnalysis(selectedFile, unlockedCtx);
  }

  async function handleToggleLiveRecording() {
    onClearError();
    setLocalError(null);

    if (isRecording) {
      // Parar gravação
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    if (!consentGiven) {
      setLocalError('Confirme o consentimento do paciente antes de iniciar a gravação.');
      return;
    }

    try {
      // Regra do Safari iOS/iPad: inicializar e retomar AudioContext no instante do toque
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = AudioCtx ? new AudioCtx() : null;
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não permite gravação de microfone nesta página.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      mediaStreamRef.current = stream;

      // Medidor visual em tempo real via AudioAnalyzer (AnalyserNode)
      if (ctx) {
        const source = ctx.createMediaStreamSource(stream);
        const liveAnalyzer = new AudioAnalyzer(2048);
        liveAnalyzer.attachToNode(ctx, source, false);
        liveAnalyzerRef.current = liveAnalyzer;

        const updateMeter = () => {
          const snap = liveAnalyzer.readLiveSnapshot();
          setLiveLevel(snap.levelPct);
          setLiveTelemetry({
            f0Hz: snap.f0Hz,
            volumeDb: snap.volumeDb,
            isSilence: snap.isSilence,
          });
          rafRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      }

      const preferredMime = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = mime.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `gravacao-ao-vivo.${ext}`, { type: mime });
        const ctxToPass = audioCtxRef.current;
        audioCtxRef.current = null;

        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (liveAnalyzerRef.current) {
          liveAnalyzerRef.current.detach();
          liveAnalyzerRef.current = null;
        }
        setLiveLevel(0);
        setLiveTelemetry(null);
        setRecordingSec(0);

        if (blob.size < 1000) {
          setLocalError('Gravação muito curta ou sem áudio captado.');
          return;
        }
        setRecordedAudio({ file, ctx: ctxToPass });
        setMicTranscript(null);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setRecordingSec(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch (err) {
      cleanupRecordingResources();
      setIsRecording(false);
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
        setLocalError(
          'Permissão de microfone negada. Libere o microfone nos ajustes do Safari/navegador ou envie um arquivo gravado no app Gravador.'
        );
      } else {
        setLocalError(translateErrorToPortuguese(err));
      }
    }
  }

  const displayedError = errorMessage || localError;
  const recMins = String(Math.floor(recordingSec / 60)).padStart(2, '0');
  const recSecs = String(recordingSec % 60).padStart(2, '0');

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Aviso obrigatório de fase de teste */}
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-base text-amber-950">
        <p className="font-semibold">Fase de teste e validação clínica</p>
        <p className="mt-1 text-amber-900">
          Use só com dados fictícios até a ferramenta ser validada. Os dados ficam apenas nesta
          tela e não são salvos em servidor.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        {/* Coluna principal: Entrada e Consentimento */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 lg:col-span-7">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
              Análise vocal e prosódica de sessões
            </h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">
              Envie uma gravação feita no app Gravador (Arquivos) para investigar tom, ritmo,
              pausas, emoções sugeridas pela voz e possíveis desencontros com as palavras.
            </p>
          </div>

          {/* Consentimento obrigatório */}
          <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100/70">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => onConsentChange(e.target.checked)}
              className="mt-1 h-6 w-6 shrink-0 cursor-pointer rounded border-slate-300 accent-teal-700"
            />
            <span className="text-base font-medium leading-snug text-slate-900">
              O paciente foi informado e concordou com a gravação e a análise desta sessão.
            </span>
          </label>

          {/* Contexto não emocional opcional */}
          <div>
            <label
              htmlFor="non-emotional-notes"
              className="block text-sm font-semibold text-slate-800 sm:text-base"
            >
              Fatores que podem alterar a voz sem relação emocional (opcional)
            </label>
            <input
              id="non-emotional-notes"
              type="text"
              value={nonEmotionalNotes}
              onChange={(e) => onNonEmotionalNotesChange(e.target.value)}
              placeholder="Ex.: paciente gripada, sotaque regional, medicação sedativa, cansaço físico..."
              className="mt-2 min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            />
          </div>

          {displayedError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900"
            >
              {displayedError}
            </div>
          )}

          {/* Forma principal: Escolher gravação */}
          <div className="space-y-4 pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".m4a,.mp3,.wav,.aac,audio/mp4,audio/x-m4a,audio/mpeg,audio/wav,audio/aac,audio/*"
              onChange={handleFilePicked}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording || loadingCaseId !== null}
              className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-4 text-lg font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50"
            >
              <Upload className="h-5 w-5 text-teal-700 shrink-0" aria-hidden="true" />
              <span>Escolher gravação (m4a, mp3, wav, aac)</span>
            </button>

            {selectedFile && (
              <div className="flex flex-col gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <FileAudio className="h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-slate-600 tabular-nums">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!consentGiven || loadingCaseId !== null}
                  onClick={handleAnalyzeSelectedFile}
                  className="min-h-[48px] rounded-xl bg-teal-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap shrink-0"
                >
                  Analisar gravação
                </button>
              </div>
            )}

            {!selectedFile && (
              <p className="text-sm text-slate-500">
                No iPad ou celular, grave no app Gravador, toque em Compartilhar → Salvar em
                Arquivos e selecione o arquivo aqui. Sessões de até 60 minutos são divididas
                automaticamente em blocos de 5 minutos.
              </p>
            )}
          </div>

          {/* Forma secundária: Gravar ao vivo (experimental) */}
          <div className="border-t border-slate-200 pt-5">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={(!consentGiven && !isRecording) || loadingCaseId !== null}
                onClick={handleToggleLiveRecording}
                className={`flex min-h-[54px] w-full items-center justify-center gap-3 rounded-xl px-6 py-3.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
                  isRecording
                    ? 'bg-rose-700 text-white hover:bg-rose-800'
                    : 'border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="h-5 w-5 fill-current shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">
                      Parar gravação ({recMins}:{recSecs})
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>Gravar ao vivo (experimental)</span>
                  </>
                )}
              </button>

              {isRecording && (
                <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <div className="flex items-center justify-between text-sm font-medium text-rose-900">
                    <span>Captando áudio pelo microfone</span>
                    <span className="font-mono tabular-nums">
                      {recMins}:{recSecs}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-rose-200">
                    <div
                      className="h-full bg-rose-600 transition-transform duration-75"
                      style={{ width: `${Math.max(4, liveLevel)}%` }}
                    />
                  </div>
                  {liveTelemetry && (
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-rose-900">
                      <span>Volume: {liveTelemetry.volumeDb} dBFS</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        F0: {liveTelemetry.f0Hz ? `${liveTelemetry.f0Hz} Hz` : '—'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{liveTelemetry.isSilence ? 'Pausa / silêncio' : 'Voz ativa'}</span>
                    </div>
                  )}
                </div>
              )}

              {recordedAudio && !isRecording && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">
                      Áudio captado pelo microfone ({(recordedAudio.file.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecordedAudio(null);
                        setMicTranscript(null);
                      }}
                      className="text-sm font-medium text-slate-600 underline hover:text-slate-900"
                    >
                      Descartar gravação
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={isTranscribingMic || !consentGiven}
                      onClick={async () => {
                        setLocalError(null);
                        setIsTranscribingMic(true);
                        try {
                          const buf = await recordedAudio.file.arrayBuffer();
                          const bytes = new Uint8Array(buf);
                          let binary = '';
                          for (let i = 0; i < bytes.length; i += 0x8000) {
                            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
                          }
                          const res = await fetch('/api/transcribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              audioBase64: btoa(binary),
                              mimeType: recordedAudio.file.type || 'audio/webm',
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            throw new Error(data.error || 'Falha ao transcrever gravação.');
                          }
                          setMicTranscript(data.transcription);
                        } catch (err) {
                          setLocalError(translateErrorToPortuguese(err));
                        } finally {
                          setIsTranscribingMic(false);
                        }
                      }}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {isTranscribingMic && (
                        <Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-hidden="true" />
                      )}
                      <span>
                        {isTranscribingMic ? 'Transcrevendo...' : 'Transcrever fala agora'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={!consentGiven || isTranscribingMic}
                      onClick={() => onStartFileAnalysis(recordedAudio.file, recordedAudio.ctx)}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-base font-semibold text-white hover:bg-teal-800 disabled:bg-slate-300"
                    >
                      Analisar voz e emoções
                    </button>
                  </div>

                  {micTranscript && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-600">
                        Transcrição do microfone
                      </p>
                      <p className="mt-1.5 text-base leading-relaxed text-slate-900">
                        {micTranscript}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!consentGiven && (
                <p className="text-sm text-slate-500">
                  Marque a confirmação de consentimento acima para liberar a análise ou gravação.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Coluna lateral: Casos fictícios de validação e compromissos éticos */}
        <aside className="space-y-6 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2.5">
              <FlaskConical className="h-5 w-5 text-teal-700 shrink-0" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-900">
                Testar com 3 casos fictícios
              </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Gera áudio falado sintético em português e executa toda a análise real (Web Audio +
              Gemini) para validação antes do uso clínico.
            </p>

            <div className="mt-4 space-y-3">
              <button
                type="button"
                disabled={!consentGiven || loadingCaseId !== null || isRecording}
                onClick={() => onRunFictitiousCase('neutra')}
                className="flex min-h-[52px] w-full flex-col items-start rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base font-semibold text-slate-900">
                  {loadingCaseId === 'neutra' ? 'Gerando áudio do Caso 1...' : '1. Fala neutra'}
                </span>
                <span className="text-sm text-slate-600">
                  Relato de rotina semanal com tom estável e ritmo regular.
                </span>
              </button>

              <button
                type="button"
                disabled={!consentGiven || loadingCaseId !== null || isRecording}
                onClick={() => onRunFictitiousCase('triste_pausas')}
                className="flex min-h-[52px] w-full flex-col items-start rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base font-semibold text-slate-900">
                  {loadingCaseId === 'triste_pausas'
                    ? 'Gerando áudio do Caso 2...'
                    : '2. Fala triste com pausas longas'}
                </span>
                <span className="text-sm text-slate-600">
                  Voz baixa, lenta, cansada, com respirações e silêncios prolongados.
                </span>
              </button>

              <button
                type="button"
                disabled={!consentGiven || loadingCaseId !== null || isRecording}
                onClick={() => onRunFictitiousCase('incongruencia_embargada')}
                className="flex min-h-[52px] w-full flex-col items-start rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base font-semibold text-slate-900">
                  {loadingCaseId === 'incongruencia_embargada'
                    ? 'Gerando áudio do Caso 3...'
                    : '3. Incongruência (“estou bem” embargada)'}
                </span>
                <span className="text-sm text-slate-600">
                  Afirma que está tudo bem, porém com voz trêmula, baixa e embargada.
                </span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">
            <h2 className="text-base font-bold text-slate-900">Princípios de uso responsável</h2>
            <ul className="mt-3 space-y-2.5">
              <li>
                <strong className="text-slate-900">Sem diagnóstico:</strong> o sistema levanta
                apenas hipóteses e sinais vocais para investigação clínica.
              </li>
              <li>
                <strong className="text-slate-900">Evidência e confiança:</strong> toda leitura
                emocional mostra o sinal na voz e o grau de confiança (baixa, média ou alta).
              </li>
              <li>
                <strong className="text-slate-900">Sem servidor de arquivos:</strong> nada é
                armazenado após o término ou limpeza da sessão.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
