import { useEffect } from 'react';
import { BookOpen, X } from 'lucide-react';

interface QuickGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickGuideModal({ isOpen, onClose }: QuickGuideModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-guide-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 shrink-0 text-teal-700" aria-hidden="true" />
            <h2 id="quick-guide-modal-title" className="text-xl font-bold text-slate-900">
              Guia de Uso Rápido
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia de uso rápido"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-base leading-relaxed text-slate-700">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-semibold text-slate-900">
              Documento de apoio. Hipóteses a confirmar pelo profissional responsável.
            </p>
            <p className="mt-1 text-sm sm:text-base">
              Os gráficos e marcações vocais ajudam a identificar pistas prosódicas para exploração
              clínica — nunca substituem a escuta terapêutica nem produzem diagnóstico.
            </p>
          </div>

          <section className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-base font-bold text-slate-900">
              1. Como ler os gráficos (Emoções na voz e Voz)
            </h3>
            <p>
              Na aba <strong>Emoções na voz</strong>, a linha do tempo mostra apenas os trechos do
              paciente, em escala de 0 (ausente) a 3 (intensa). Toque em qualquer ponto para ver o
              trecho exato, a evidência audível na voz e o grau de confiança (baixa, média ou alta).
            </p>
            <p>
              Na aba <strong>Voz</strong>, os quatro gráficos medem altura (F0 em Hz), volume
              (dBFS), proporção de silêncio e velocidade da fala ao longo da sessão. A{' '}
              <strong>linha tracejada</strong> representa a base inicial do próprio paciente nos
              primeiros minutos: observe desvios em relação a ela, ponderando qualidade do áudio e
              fatores não emocionais (cansaço, gripe, sotaque ou medicações).
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-base font-bold text-slate-900">
              2. Como interpretar as incongruências
            </h3>
            <p>
              A marcação <strong>“Fala e voz divergem”</strong> sinaliza trechos em que o conteúdo
              literal das palavras e a prosódia apontam para direções diferentes — por exemplo,
              dizer “está tudo bem” com voz baixa, lenta ou embargada.
            </p>
            <p>
              Considere cada registro como uma <strong>hipótese de trabalho</strong> para investigar
              com delicadeza em sessão (ouvindo o trecho original no player), e não como prova de
              ocultação ou afirmação diagnóstica.
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-base font-bold text-slate-900">
              3. Como agir diante dos sinais de alerta
            </h3>
            <p>
              A aba <strong>Sinais para investigar</strong> reúne hipóteses por área clínica
              (como humor, ansiedade, sono ou energia), acompanhadas de sugestões de perguntas
              abertas para apoiar a condução das próximas sessões.
            </p>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
              <p className="font-semibold text-red-900">Banner vermelho de Alerta de Risco</p>
              <p className="mt-1 text-sm sm:text-base">
                Quando há menções ou sinais vocais ligados a morte, autolesão ou desesperança
                intensa, um alerta fixo aparece no topo com o trecho e o horário exato. A avaliação
                clínica do risco cabe exclusivamente à psicóloga responsável; em situações urgentes,
                acione os protocolos de cuidado e apoio (<strong>CVV 188</strong> e{' '}
                <strong>SAMU 192</strong>).
              </p>
            </div>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-base font-bold text-slate-900">
              4. Ética, consentimento e privacidade
            </h3>
            <p>
              Utilize o aplicativo apenas após o consentimento informado do paciente e, ao encerrar
              sua revisão ou exportar o relatório, clique em{' '}
              <strong>“Apagar tudo desta sessão”</strong> — nenhum áudio ou análise fica salvo em
              servidor.
            </p>
          </section>
        </div>

        <div className="mt-7 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-xl bg-teal-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-teal-800"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
