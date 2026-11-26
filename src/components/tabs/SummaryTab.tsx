import type { ResumoSessao, SegmentoAnalise } from '../../types/analysis.ts';

interface SummaryTabProps {
  resumo: ResumoSessao | null;
  trechos: SegmentoAnalise[];
}

export function SummaryTab({ resumo, trechos }: SummaryTabProps) {
  if (!resumo) {
    const patientCount = trechos.filter((t) => t.falante === 'Paciente').length;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-base text-slate-700">
        <h2 className="text-lg font-bold text-slate-900">Resumo da sessão</h2>
        <p className="mt-2">
          Foram analisados {patientCount} trechos de fala do paciente. Utilize as abas acima para
          revisar transcrição, emoções sugeridas pela voz, medidas acústicas e sinais clínicos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-slate-900">Panorama emocional sugerido</h2>
        <p className="mt-3 text-base leading-relaxed text-slate-800 sm:text-lg">
          {resumo.panorama_emocional}
        </p>

        {resumo.comparacao_linha_de_base && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <h3 className="text-base font-bold text-slate-900">
              Comparação com a linha de base do próprio paciente
            </h3>
            <p className="mt-1.5 text-base leading-relaxed text-slate-700">
              {resumo.comparacao_linha_de_base}
            </p>
          </div>
        )}
      </section>

      {resumo.momentos_chave.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">Momentos-chave da sessão</h2>
          <div className="mt-4 space-y-3">
            {resumo.momentos_chave.map((mk, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base"
              >
                <p className="font-mono text-sm font-semibold tabular-nums text-teal-800">
                  {mk.tempo}
                </p>
                <p className="mt-1 font-medium text-slate-900">{mk.descricao}</p>
                <p className="mt-1 text-sm text-slate-600">
                  <strong>Evidência na voz:</strong> {mk.evidencia_vocal}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {resumo.perguntas_prioritarias.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Perguntas sugeridas para a próxima sessão
          </h2>
          <div className="mt-4 space-y-3">
            {resumo.perguntas_prioritarias.map((pq, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 text-base"
              >
                <p className="text-sm font-semibold capitalize text-teal-900">{pq.area}</p>
                <p className="mt-1 font-medium text-slate-900">“{pq.pergunta}”</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {resumo.fatores_confundidores.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">
            Fatores não emocionais a considerar na leitura
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base text-slate-700">
            {resumo.fatores_confundidores.map((f, idx) => (
              <li key={idx}>{f}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
