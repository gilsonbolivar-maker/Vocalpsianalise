import { ShieldCheck, X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-teal-700 shrink-0" aria-hidden="true" />
            <h2 id="settings-modal-title" className="text-xl font-bold text-slate-900">
              Configurações, Ética e LGPD
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-700">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <p className="font-semibold text-slate-900">Aviso obrigatório para uso clínico</p>
            <p className="mt-1.5">
              Para uso com pacientes reais, a conta da API deve estar num plano pago, em que os
              dados não são usados para treinar modelos, e o uso deve seguir a LGPD.
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">Armazenamento e privacidade</h3>
            <p>
              Nenhum áudio, transcrição ou resultado é guardado em servidor ou banco de dados. Toda
              a sessão permanece apenas na memória desta tela até você exportar ou clicar em
              “Apagar tudo desta sessão”.
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">Processamento acústico e IA</h3>
            <p>
              As medidas objetivas (frequência fundamental, volume, pausas e velocidade) são
              calculadas localmente no próprio aparelho via Web Audio. Apenas os blocos de áudio e
              o resumo acústico são enviados ao servidor proxy seguro para análise direta pelo
              modelo Gemini.
            </p>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">Limites da ferramenta</h3>
            <p>
              Documento de apoio. Hipóteses a confirmar pelo profissional responsável. O aplicativo
              não realiza diagnósticos clínicos.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
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
