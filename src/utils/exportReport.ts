import { jsPDF } from 'jspdf';
import type { SessaoAnalisada } from '../types/analysis.ts';
import { formatSecondsToMMSS } from './validation.ts';

const AVISO_ETICO = 'Documento de apoio. Hipóteses a confirmar pelo profissional responsável.';

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSessionAsJson(sessao: SessaoAnalisada): void {
  const payload = {
    schema_destino: 'Anamnese PSI',
    origem: 'Vocalpsianalise',
    versao_formato: '1.0',
    aviso_etico: AVISO_ETICO,
    exportado_em: new Date().toISOString(),
    sessao: {
      nome_arquivo: sessao.nomeArquivo,
      duracao_segundos: sessao.duracaoSeg,
      duracao_formatada: formatSecondsToMMSS(sessao.duracaoSeg),
      fatores_contexto_informados: sessao.fatoresContextoInformados,
      fatores_nao_emocionais_observados: sessao.fatoresNaoEmocionais,
      qualidade_audio: {
        classificacao: sessao.medidasAcusticas.qualidadeAudio,
        snr_db: sessao.medidasAcusticas.snrEstimadoDb,
        observacoes: sessao.observacoesQualidadeAudio,
      },
      medidas_acusticas_objetivas: sessao.medidasAcusticas,
      resumo: sessao.resumo,
      trechos: sessao.trechos,
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const baseName = sessao.nomeArquivo.replace(/\.[^.]+$/, '') || 'sessao';
  triggerBlobDownload(blob, `vocalpsianalise-${baseName}.json`);
}

export function exportSessionAsText(sessao: SessaoAnalisada): void {
  const lines: string[] = [];
  lines.push('VOCALPSIANALISE — RELATÓRIO DE APOIO À ANÁLISE VOCAL E PROSÓDICA');
  lines.push('================================================================');
  lines.push(AVISO_ETICO);
  lines.push('');
  lines.push(`Arquivo: ${sessao.nomeArquivo}`);
  lines.push(`Duração: ${formatSecondsToMMSS(sessao.duracaoSeg)}`);
  lines.push(`Qualidade do áudio: ${sessao.medidasAcusticas.qualidadeAudio.toUpperCase()} (SNR ~${sessao.medidasAcusticas.snrEstimadoDb} dB)`);
  if (sessao.fatoresContextoInformados) {
    lines.push(`Contexto informado: ${sessao.fatoresContextoInformados}`);
  }
  lines.push('');

  const riscos = sessao.trechos.filter((t) => t.alerta_de_risco.status === 'sim');
  if (riscos.length > 0) {
    lines.push('*** ALERTA DE RISCO IDENTIFICADO (AVALIAÇÃO CABE À PSICÓLOGA) ***');
    lines.push('Contatos de emergência: CVV 188 | SAMU 192');
    for (const r of riscos) {
      lines.push(`- [${r.inicio} - ${r.fim}] "${r.transcricao}"`);
      lines.push(`  Motivo: ${r.alerta_de_risco.motivo}`);
    }
    lines.push('');
  }

  if (sessao.resumo) {
    lines.push('1. RESUMO DA SESSÃO');
    lines.push('-------------------');
    lines.push(sessao.resumo.panorama_emocional);
    lines.push('');
    if (sessao.resumo.comparacao_linha_de_base) {
      lines.push(`Comparação com linha de base: ${sessao.resumo.comparacao_linha_de_base}`);
      lines.push('');
    }
    if (sessao.resumo.momentos_chave.length > 0) {
      lines.push('Momentos-chave:');
      for (const mk of sessao.resumo.momentos_chave) {
        lines.push(`- [${mk.tempo}] ${mk.descricao} (Voz: ${mk.evidencia_vocal})`);
      }
      lines.push('');
    }
  }

  lines.push('2. MEDIDAS OBJETIVAS DA VOZ (WEB AUDIO LOCAL)');
  lines.push('---------------------------------------------');
  const g = sessao.medidasAcusticas.geral;
  const b = sessao.medidasAcusticas.linhaDeBase;
  lines.push(`Altura média (F0): ${g.f0MediaHz ? `${g.f0MediaHz} Hz (±${g.f0VariacaoHz} Hz)` : 'Indisponível'} | Base inicial: ${b.f0MediaHz ? `${b.f0MediaHz} Hz` : 'Indisponível'}`);
  lines.push(`Volume médio: ${g.volumeMedioDb} dBFS (±${g.volumeVariacaoDb} dB) | Base inicial: ${b.volumeMedioDb} dBFS`);
  lines.push(`Silêncio/Pausas: ${g.proporcaoSilencioPct}% do tempo | Média das pausas: ${g.duracaoMediaPausasSeg}s | Pausas longas (>=1.5s): ${g.totalPausasLongas}`);
  lines.push(`Velocidade aproximada: ${g.velocidadeSilabasSeg} sílabas/s (${g.velocidadeLabel})`);
  lines.push('');

  const incongruencias = sessao.trechos.filter((t) => t.congruencia.status === 'nao_combina');
  lines.push('3. INCONGRUÊNCIAS (FALA X TOM DE VOZ)');
  lines.push('-------------------------------------');
  if (incongruencias.length === 0) {
    lines.push('Nenhuma incongruência acentuada identificada nesta sessão.');
  } else {
    for (const inc of incongruencias) {
      lines.push(`- [${inc.inicio} - ${inc.fim}] ${inc.falante}: "${inc.transcricao}"`);
      lines.push(`  Explicação: ${inc.congruencia.explicacao}`);
    }
  }
  lines.push('');

  lines.push('4. SINAIS PARA INVESTIGAÇÃO CLÍNICA');
  lines.push('-----------------------------------');
  const sinais = sessao.trechos.flatMap((t) =>
    t.sinais_para_investigar.map((s) => ({ ...s, inicio: t.inicio, fim: t.fim, transcricao: t.transcricao, voz: t.marcadores_da_voz }))
  );
  if (sinais.length === 0) {
    lines.push('Nenhum sinal específico destacado.');
  } else {
    for (const s of sinais) {
      lines.push(`- Área: ${s.area} [${s.inicio} - ${s.fim}]`);
      lines.push(`  O que foi dito: "${s.transcricao}"`);
      lines.push(`  Como foi dito: Tom ${s.voz.tom}; velocidade ${s.voz.velocidade}; qualidade ${s.voz.qualidade_da_voz}.`);
      lines.push(`  Hipótese/Justificativa: ${s.justificativa}`);
      lines.push(`  Pergunta sugerida: "${s.pergunta_sugerida}"`);
    }
  }
  lines.push('');

  lines.push('5. TRANSCRIÇÃO COM MARCADORES');
  lines.push('------------------------------');
  for (const t of sessao.trechos) {
    lines.push(`[${t.inicio} - ${t.fim}] ${t.falante}: ${t.transcricao}`);
    if (t.falante === 'Paciente' && t.emocoes.length > 0) {
      const topEmo = t.emocoes
        .filter((e) => e.intensidade > 0)
        .map((e) => `${e.emocao} (int. ${e.intensidade}/3, conf. ${e.confianca}: ${e.evidencias_na_voz})`)
        .join('; ');
      if (topEmo) {
        lines.push(`   Sinais vocais: ${topEmo}`);
      }
    }
  }
  lines.push('');
  lines.push('================================================================');
  lines.push(AVISO_ETICO);

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const baseName = sessao.nomeArquivo.replace(/\.[^.]+$/, '') || 'sessao';
  triggerBlobDownload(blob, `vocalpsianalise-${baseName}.txt`);
}

export function exportSessionAsPdf(sessao: SessaoAnalisada): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 22) {
      addFooter();
      doc.addPage();
      y = 18;
    }
  };

  const addFooter = () => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 100, 115);
    doc.text(AVISO_ETICO, margin, pageHeight - 10);
  };

  const writeParagraph = (text: string, fontSize = 10, bold = false, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const split = doc.splitTextToSize(text, maxWidth);
    for (const line of split) {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += fontSize * 0.45 + 1;
    }
  };

  // Cabeçalho
  writeParagraph('Vocalpsianalise — Documento de Apoio Clínico', 15, true, [15, 118, 110]);
  writeParagraph(AVISO_ETICO, 9.5, true, [180, 83, 9]);
  y += 2;
  writeParagraph(
    `Arquivo: ${sessao.nomeArquivo}  |  Duração: ${formatSecondsToMMSS(sessao.duracaoSeg)}  |  Qualidade: ${sessao.medidasAcusticas.qualidadeAudio}`,
    9.5,
    false,
    [71, 85, 105]
  );
  y += 4;

  // Alerta de risco
  const riscos = sessao.trechos.filter((t) => t.alerta_de_risco.status === 'sim');
  if (riscos.length > 0) {
    ensureSpace(24);
    writeParagraph('ALERTA DE RISCO IDENTIFICADO — AVALIAÇÃO CABE À PSICÓLOGA', 11, true, [185, 28, 28]);
    writeParagraph('Contatos de apoio: CVV 188 | SAMU 192', 10, true, [185, 28, 28]);
    for (const r of riscos) {
      writeParagraph(`[${r.inicio} - ${r.fim}] "${r.transcricao}" — ${r.alerta_de_risco.motivo}`, 9.5, false, [153, 27, 27]);
    }
    y += 4;
  }

  // Resumo
  if (sessao.resumo) {
    writeParagraph('1. Resumo da Sessão', 12, true, [15, 23, 42]);
    writeParagraph(sessao.resumo.panorama_emocional, 10);
    if (sessao.resumo.comparacao_linha_de_base) {
      y += 1;
      writeParagraph(`Linha de base: ${sessao.resumo.comparacao_linha_de_base}`, 9.5, false, [51, 65, 85]);
    }
    y += 4;
  }

  // Medidas acústicas
  writeParagraph('2. Medidas Objetivas da Voz (calculadas localmente)', 12, true, [15, 23, 42]);
  const g = sessao.medidasAcusticas.geral;
  writeParagraph(
    `Altura média (F0): ${g.f0MediaHz ? `${g.f0MediaHz} Hz (±${g.f0VariacaoHz} Hz)` : 'Indisponível'}  |  Volume: ${g.volumeMedioDb} dBFS (±${g.volumeVariacaoDb} dB)`,
    9.5
  );
  writeParagraph(
    `Silêncio: ${g.proporcaoSilencioPct}%  |  Média de pausas: ${g.duracaoMediaPausasSeg}s  |  Velocidade: ${g.velocidadeSilabasSeg} sílabas/s (${g.velocidadeLabel})`,
    9.5
  );
  y += 4;

  // Incongruências
  const incongruencias = sessao.trechos.filter((t) => t.congruencia.status === 'nao_combina');
  writeParagraph('3. Incongruências (Fala x Tom de Voz)', 12, true, [15, 23, 42]);
  if (incongruencias.length === 0) {
    writeParagraph('Nenhuma incongruência acentuada identificada.', 9.5, false, [71, 85, 105]);
  } else {
    for (const inc of incongruencias) {
      writeParagraph(`[${inc.inicio} - ${inc.fim}] "${inc.transcricao}"`, 9.5, true);
      writeParagraph(`Hipótese: ${inc.congruencia.explicacao}`, 9.5);
      y += 1;
    }
  }
  y += 4;

  // Sinais para investigar
  writeParagraph('4. Sinais para Investigação Clínica', 12, true, [15, 23, 42]);
  const sinais = sessao.trechos.flatMap((t) =>
    t.sinais_para_investigar.map((s) => ({ ...s, inicio: t.inicio, fim: t.fim, transcricao: t.transcricao }))
  );
  if (sinais.length === 0) {
    writeParagraph('Nenhum sinal específico destacado.', 9.5, false, [71, 85, 105]);
  } else {
    for (const s of sinais) {
      writeParagraph(`${s.area.toUpperCase()} [${s.inicio} - ${s.fim}]`, 10, true, [15, 118, 110]);
      writeParagraph(`Trecho: "${s.transcricao}"`, 9.5);
      writeParagraph(`Sinal: ${s.justificativa}`, 9.5);
      writeParagraph(`Pergunta sugerida: "${s.pergunta_sugerida}"`, 9.5, true);
      y += 2;
    }
  }
  y += 3;

  // Transcrição resumida
  writeParagraph('5. Transcrição por Falante', 12, true, [15, 23, 42]);
  for (const t of sessao.trechos) {
    writeParagraph(`[${t.inicio} - ${t.fim}] ${t.falante}: ${t.transcricao}`, 9.5);
  }

  y += 4;
  writeParagraph(AVISO_ETICO, 9.5, true, [180, 83, 9]);
  addFooter();

  const baseName = sessao.nomeArquivo.replace(/\.[^.]+$/, '') || 'sessao';
  doc.save(`vocalpsianalise-${baseName}.pdf`);
}
