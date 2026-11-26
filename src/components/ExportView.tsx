import { ArrowLeft, FileCode2, FileText, FileType2, Info } from 'lucide-react';
import type { SessaoAnalisada } from '../types/analysis.ts';
import {
  exportSessionAsJson,
  exportSessionAsPdf,
  exportSessionAsText,
} from '../utils/exportReport.ts';

interface ExportViewProps {
  sessao: SessaoAnalisada;
  onBackToResults: () => void;
}

export function ExportView({ sessao, onBackToResults }: ExportViewProps) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <button
        type="button"
        onClick={onBackToResults}
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Voltar aos resultados</span>
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Exportar relatório da sessão</h1>
        <p className="mt-2 text-base text-slate-600">
          Escolha o formato para salvar no iPad, celular ou computador. Nenhum arquivo fica guardado
          no servidor após o download.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => exportSessionAsPdf(sessao)}
            className="flex min-h-[148px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40 active:scale-[0.99]"
          >
            <FileType2 className="h-7 w-7 text-teal-700" aria-hidden="true" />
            <div className="mt-4">
              <p className="text-lg font-bold text-slate-900">Relatório em PDF</p>
              <p className="mt-1 text-sm text-slate-600">
                Documento estruturado com resumo, medidas vocais, sinais e aviso ético no rodapé.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => exportSessionAsText(sessao)}
            className="flex min-h-[148px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40 active:scale-[0.99]"
          >
            <FileText className="h-7 w-7 text-teal-700" aria-hidden="true" />
            <div className="mt-4">
              <p className="text-lg font-bold text-slate-900">Relatório em texto (.txt)</p>
              <p className="mt-1 text-sm text-slate-600">
                Texto limpo para colar em prontuário eletrônico ou anotações pessoais.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => exportSessionAsJson(sessao)}
            className="flex min-h-[148px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/40 active:scale-[0.99]"
          >
            <FileCode2 className="h-7 w-7 text-teal-700" aria-hidden="true" />
            <div className="mt-4">
              <p className="text-lg font-bold text-slate-900">JSON completo (Anamnese PSI)</p>
              <p className="mt-1 text-sm text-slate-600">
                Dados estruturados completos de todos os trechos para integração futura com o app
                Anamnese PSI.
              </p>
            </div>
          </button>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 sm:text-base">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden="true" />
          <p className="font-semibold">
            Documento de apoio. Hipóteses a confirmar pelo profissional responsável.
          </p>
        </div>
      </section>
    </main>
  );
}
