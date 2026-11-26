import './estilo.css';
import { TAXA, pontoDeCorte, ehQuaseSilencio, limparTexto, reduzirTaxa, rms, paraWav } from './trechos';

const VERSAO = '0.2.1';
const MODELOS = {
  rapido: { id: 'onnx-community/whisper-base', nome: 'Rápido', tamanho: 'cerca de 80 MB' },
  preciso: { id: 'onnx-community/whisper-small', nome: 'Mais preciso', tamanho: 'cerca de 250 MB' },
  nuvem: { id: '@cf/openai/whisper-large-v3-turbo', nome: 'Nuvem', tamanho: '' },
} as const;
type ChaveModelo = keyof typeof MODELOS;

const SIMULAR = new URLSearchParams(location.search).has('simular');
const ENDERECO_PROTEGIDO = 'vocal.pixelnexo.com.br';
const NUVEM_DISPONIVEL = location.hostname === ENDERECO_PROTEGIDO || SIMULAR;

interface Trecho { id: number; inicio: number; texto: string; pendente: boolean; }

const estado = {
  tela: 'inicio' as 'inicio' | 'carregando' | 'gravando' | 'encerrada',
  consentimento: false,
  modelo: (NUVEM_DISPONIVEL ? 'nuvem' : 'rapido') as ChaveModelo,
  pausado: false,
  segundos: 0,
  trechos: [] as Trecho[],
  progresso: {} as Record<string, { c: number; t: number }>,
  erro: '',
  dispositivo: '',
};

const app = document.getElementById('app')!;
let worker: Worker | null = null;
let modeloCarregado: ChaveModelo | null = null;

// ---------- áudio ----------
let ctx: AudioContext | null = null;
let fluxo: MediaStream | null = null;
let no: AudioWorkletNode | null = null;
let taxaOrigem = TAXA;
let pedacos: Float32Array[] = [];
let amostrasNoBuffer = 0;
let amostrasTotais = 0;
let inicioDoBuffer = 0; // em segundos desde o começo da sessão
let proximoId = 1;
let relogio: number | undefined;
let travaTela: any = null;
let nivelAtual = 0;
let desdeUltimaChecagem = 0;
let ultimoAudio = 0;
let erroAudio = '';
const NOMES_ESTADO: Record<string, string> = { running: 'ligado', suspended: 'parado', interrupted: 'interrompido pelo iPad', closed: 'fechado' };
let picoRecente = 0;

/** Mostra na tela se o som do microfone está chegando, e oferece um botão para destravar. */
function atualizarDiagnostico() {
  const el = document.getElementById('diagnostico');
  if (!el || estado.tela !== 'gravando') return;
  const chegando = performance.now() - ultimoAudio < 1500 && ctx?.state === 'running';
  const estadoTxt = `Estado do áudio: ${NOMES_ESTADO[ctx?.state || 'closed'] || ctx?.state}${no ? '' : ' · gravador não montado'}${erroAudio ? ' · erro: ' + escapar(erroAudio) : ''}`;
  if (!chegando) {
    el.innerHTML = `<div class="aviso" style="margin:12px 0 0">O som do microfone <b>não está chegando</b>.
      <button class="principal" id="destravar" style="margin-top:10px">Tocar aqui para ativar o microfone</button>
      <small style="display:block;margin-top:8px">${estadoTxt}</small></div>`;
    document.getElementById('destravar')!.onclick = reconstruirAudio;
  } else if (picoRecente < 0.02) {
    el.innerHTML = `<p class="suave" style="margin:12px 0 0">Microfone ligado, mas o som está <b>muito baixo</b>. Aproxime o aparelho de quem fala.</p>`;
  } else {
    el.innerHTML = `<p class="suave" style="margin:12px 0 0;color:var(--verde)"><b>Microfone captando bem.</b></p>`;
  }
  picoRecente *= 0.6;
}

function juntar(): Float32Array {
  const out = new Float32Array(amostrasNoBuffer);
  let o = 0;
  for (const p of pedacos) { out.set(p, o); o += p.length; }
  return out;
}

function receberAudio(bruto: Float32Array) {
  ultimoAudio = performance.now();
  if (estado.pausado) return;
  const a = reduzirTaxa(bruto, taxaOrigem);
  pedacos.push(a);
  amostrasNoBuffer += a.length;
  amostrasTotais += a.length;
  const vol = rms(a);
  if (vol > picoRecente) picoRecente = vol;
  nivelAtual = Math.min(1, vol * 8);
  const barra = document.getElementById('nivel');
  if (barra) barra.style.width = `${Math.round(nivelAtual * 100)}%`;
  // Confere o ponto de corte só a cada meio segundo, para não pesar no aparelho.
  desdeUltimaChecagem += a.length;
  if (desdeUltimaChecagem >= TAXA / 2) { desdeUltimaChecagem = 0; tentarCortar(false); }
}

function tentarCortar(forcar: boolean) {
  if (amostrasNoBuffer === 0) return;
  const buf = juntar();
  const corte = pontoDeCorte(buf, forcar);
  if (corte === null) return;
  const trecho = buf.slice(0, corte);
  const resto = buf.slice(corte);
  const inicio = inicioDoBuffer;
  inicioDoBuffer += corte / TAXA;
  pedacos = resto.length ? [resto] : [];
  amostrasNoBuffer = resto.length;
  if (ehQuaseSilencio(trecho)) return;
  const id = proximoId++;
  estado.trechos.push({ id, inicio, texto: 'Transcrevendo…', pendente: true });
  desenharTranscricao();
  if (estado.modelo === 'nuvem') transcreverNaNuvem(id, trecho);
  else worker!.postMessage({ tipo: 'transcrever', id, audio: trecho, segundos: trecho.length / TAXA }, [trecho.buffer]);
}

/**
 * O Safari do iPad só libera o som se o áudio for ligado no momento do toque.
 * Por isso esta função é chamada direto no clique do botão, antes de qualquer espera.
 */
function ligarAudioNoToque() {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  ctx.resume().catch(() => { /* tenta de novo depois */ });
}

/** Liga o som do microfone ao gravador dentro do contexto de áudio atual. */
async function montarGrafo() {
  if (!ctx || !fluxo) return;
  taxaOrigem = ctx.sampleRate;
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}gravador-worklet.js`);
  const fonte = ctx.createMediaStreamSource(fluxo);
  no = new AudioWorkletNode(ctx, 'gravador');
  no.port.onmessage = (e) => receberAudio(e.data as Float32Array);
  fonte.connect(no);
}

function novoContexto() {
  const c = new AudioContext();
  c.onstatechange = () => atualizarDiagnostico();
  // Não espera: no iPad, este comando às vezes nunca termina.
  c.resume().catch(() => {});
  return c;
}

/** Pede o microfone. Só esta parte espera, porque é quando o iPad pergunta a permissão. */
async function pedirMicrofone() {
  fluxo = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

/** Liga o áudio sem travar a tela: se algo demorar, o aviso na tela mostra. */
function ligarAudio() {
  if (!ctx || ctx.state === 'closed') ctx = novoContexto();
  else { ctx.onstatechange = () => atualizarDiagnostico(); ctx.resume().catch(() => {}); }
  montarGrafo().catch((e) => { erroAudio = String(e?.message || e); atualizarDiagnostico(); });
  (navigator as any).wakeLock?.request('screen').then((t: any) => { travaTela = t; }).catch(() => {});
}

/** Chamado no toque do botão de destravar: recria o áudio do zero, dentro do toque. */
function reconstruirAudio() {
  try { no?.disconnect(); } catch { /* ignora */ }
  no = null;
  const velho = ctx;
  ctx = novoContexto();
  velho?.close().catch(() => {});
  erroAudio = '';
  montarGrafo().catch((e) => { erroAudio = String(e?.message || e); atualizarDiagnostico(); });
  setTimeout(atualizarDiagnostico, 800);
}

function pararMicrofone() {
  try { no?.disconnect(); } catch { /* ignora */ }
  fluxo?.getTracks().forEach(t => t.stop());
  try { travaTela?.release(); } catch { /* ignora */ }
  // O contexto de áudio fica aberto (suspenso) para a próxima sessão funcionar no iPad.
  ctx?.suspend().catch(() => {});
  no = null; fluxo = null; travaTela = null;
}

// ---------- modelo ----------
function garantirWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./transcritor.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.tipo === 'progresso') {
      estado.progresso[m.arquivo] = { c: m.carregado, t: m.total };
      desenharProgresso();
    } else if (m.tipo === 'pronto') {
      estado.dispositivo = m.dispositivo;
      modeloCarregado = estado.modelo;
      comecarGravacao();
    } else if (m.tipo === 'erro') {
      estado.erro = 'Não foi possível baixar o modelo de voz. Confira a internet e tente de novo. Detalhe: ' + m.mensagem;
      estado.tela = 'inicio';
      desenhar();
    } else if (m.tipo === 'texto') {
      aplicarTexto(m.id, m.erro ? '(falha ao transcrever este trecho)' : limparTexto(m.texto || ''));
    }
  };
  return worker;
}

function aplicarTexto(id: number, texto: string) {
  const t = estado.trechos.find(x => x.id === id);
  if (!t) return;
  t.texto = texto;
  t.pendente = false;
  if (!t.texto) estado.trechos = estado.trechos.filter(x => x.id !== id);
  desenharTranscricao();
}

/** Modo nuvem: manda o trecho para a transcrição na conta da Cloudflare e recebe o texto. */
async function transcreverNaNuvem(id: number, trecho: Float32Array) {
  if (SIMULAR) {
    await new Promise(r => setTimeout(r, 400));
    aplicarTexto(id, `[nuvem simulada: ${(trecho.length / TAXA).toFixed(1)} s]`);
    return;
  }
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}api/transcrever`, {
      method: 'POST', body: paraWav(trecho), headers: { 'Content-Type': 'audio/wav' },
      credentials: 'same-origin', redirect: 'manual',
    });
    if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) {
      aplicarTexto(id, '(o acesso expirou: recarregue a página e entre de novo com o código do e-mail)');
      return;
    }
    if (r.status === 429) { aplicarTexto(id, '(a cota grátis de hoje acabou: use o modo Rápido até amanhã)'); return; }
    if (!r.ok) { aplicarTexto(id, '(falha ao transcrever este trecho)'); return; }
    const j = await r.json();
    aplicarTexto(id, limparTexto(j.texto || ''));
  } catch {
    aplicarTexto(id, '(sem internet: este trecho não foi transcrito)');
  }
}

async function iniciarSessao() {
  estado.erro = '';
  if (estado.modelo === 'nuvem') { comecarGravacao(); return; }
  if (modeloCarregado === estado.modelo) { comecarGravacao(); return; }
  estado.tela = 'carregando';
  estado.progresso = {};
  desenhar();
  if (worker && modeloCarregado !== estado.modelo) { worker.terminate(); worker = null; }
  garantirWorker().postMessage({ tipo: 'carregar', modelo: MODELOS[estado.modelo].id, simular: SIMULAR });
}

async function comecarGravacao() {
  try {
    await pedirMicrofone();
  } catch (err) {
    estado.erro = 'O microfone não foi liberado. Permita o uso do microfone para este site e tente de novo.';
    estado.tela = 'inicio';
    desenhar();
    return;
  }
  estado.tela = 'gravando';
  estado.pausado = false;
  estado.segundos = 0;
  estado.trechos = [];
  pedacos = []; amostrasNoBuffer = 0; amostrasTotais = 0; inicioDoBuffer = 0;
  ultimoAudio = performance.now(); picoRecente = 0.05;
  desenhar();
  ligarAudio();
  relogio = window.setInterval(() => {
    if (!estado.pausado) { estado.segundos++; const r = document.getElementById('relogio'); if (r) r.textContent = formatar(estado.segundos); }
    atualizarDiagnostico();
  }, 1000);
  desenhar();
}

function alternarPausa() {
  ctx?.resume().catch(() => {});
  if (!estado.pausado) tentarCortar(true);
  estado.pausado = !estado.pausado;
  if (!estado.pausado) inicioDoBuffer = estado.segundos;
  desenhar();
}

function encerrar() {
  tentarCortar(true);
  pararMicrofone();
  clearInterval(relogio);
  estado.tela = 'encerrada';
  desenhar();
}

function novaSessao() {
  if (!confirm('Apagar esta transcrição e começar uma nova sessão? O texto não fica salvo em lugar nenhum.')) return;
  estado.trechos = [];
  estado.consentimento = false;
  estado.tela = 'inicio';
  desenhar();
}

// ---------- texto ----------
function formatar(s: number) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function textoCompleto() {
  const data = new Date().toLocaleString('pt-BR');
  const linhas = estado.trechos.filter(t => !t.pendente).map(t => `[${formatar(t.inicio)}] ${t.texto}`);
  return `Transcrição de sessão — ${data}\nDocumento de apoio. Uso restrito ao profissional responsável.\n\n${linhas.join('\n')}\n`;
}

async function copiar() {
  try { await navigator.clipboard.writeText(textoCompleto()); alert('Texto copiado.'); }
  catch { alert('Não foi possível copiar. Use o botão de baixar.'); }
}

function baixar() {
  const blob = new Blob([textoCompleto()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `transcricao-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- telas ----------
function cabecalho() {
  return `<header><h1>Vocalpsianalise</h1><span class="versao">Versão ${VERSAO}${SIMULAR ? ' · modo simulado' : ''}</span></header>`;
}

function telaInicio() {
  const op = (k: ChaveModelo) => `
    <label class="opcao"><input type="radio" name="modelo" value="${k}" ${estado.modelo === k ? 'checked' : ''}>
      <span><b>${MODELOS[k].nome}</b>${k === 'rapido' ? ' (recomendado)' : ''}<small>Baixa ${MODELOS[k].tamanho}, só na primeira vez.</small></span></label>`;
  const nuvem = NUVEM_DISPONIVEL
    ? `<label class="opcao"><input type="radio" name="modelo" value="nuvem" ${estado.modelo === 'nuvem' ? 'checked' : ''}>
        <span><b>Nuvem</b> (o mais preciso)<small>Não baixa nada. <b>O áudio de cada trecho é enviado</b> para transcrição na conta da Cloudflare do projeto e não fica guardado lá.</small></span></label>`
    : `<label class="opcao" style="opacity:.6;cursor:default"><input type="radio" disabled>
        <span><b>Nuvem</b> (o mais preciso)<small>Disponível só no endereço protegido: <a href="https://${ENDERECO_PROTEGIDO}/">${ENDERECO_PROTEGIDO}</a></small></span></label>`;
  const passo3 = estado.modelo === 'nuvem'
    ? 'No modo Nuvem, o áudio de cada trecho é enviado para transcrição e devolvido como texto. Nada fica guardado.'
    : 'O áudio é processado <b>só neste aparelho</b>. Nada da sessão vai para a internet.';
  return `${cabecalho()}
    <div class="aviso"><b>Fase de teste.</b> Use só com dados fictícios. O programa não faz diagnóstico: ele transcreve a fala para apoiar a psicóloga.</div>
    ${estado.erro ? `<div class="aviso" style="color:var(--vermelho)">${estado.erro}</div>` : ''}
    <div class="cartao">
      <h2>Como funciona</h2>
      <ol class="passos suave">
        <li>Você confirma que o paciente concordou.</li>
        <li>O programa ouve pelo microfone e escreve o que é dito.</li>
        <li id="passo3">${passo3}</li>
        <li>Ao encerrar, você copia ou baixa o texto. Nada fica salvo.</li>
      </ol>
    </div>
    <div class="cartao">
      <h2>Modelo de voz</h2>
      ${nuvem}${op('rapido')}${op('preciso')}
    </div>
    <div class="cartao">
      <h2>Consentimento</h2>
      <label class="opcao"><input type="checkbox" id="consent" ${estado.consentimento ? 'checked' : ''}>
        <span>O paciente foi informado e <b>concordou</b> com a escuta e a transcrição desta sessão.</span></label>
      <div style="margin-top:16px"><button class="principal" id="iniciar" ${estado.consentimento ? '' : 'disabled'}>Iniciar sessão</button></div>
    </div>
    <p class="rodape">Documento de apoio. Hipóteses a confirmar pelo profissional responsável.</p>`;
}

function telaCarregando() {
  return `${cabecalho()}
    <div class="cartao">
      <h2>Preparando o modelo de voz</h2>
      <p class="suave">Na primeira vez, o modelo é baixado e fica guardado neste aparelho. Nas próximas, começa bem mais rápido.</p>
      <div class="barra"><div id="barra-progresso"></div></div>
      <p class="suave" id="texto-progresso">Começando…</p>
    </div>`;
}

function telaGravando() {
  return `${cabecalho()}
    <div class="cartao">
      <div class="status"><span class="ponto ${estado.pausado ? 'pausado' : ''}"></span>
        <span>${estado.pausado ? 'Pausado' : 'Ouvindo'}</span>
        <span class="relogio" id="relogio">${formatar(estado.segundos)}</span></div>
      <div class="nivel"><div id="nivel"></div></div>
      <div id="diagnostico"></div>
      <div class="linha-botoes">
        <button class="secundario" id="pausar">${estado.pausado ? 'Retomar' : 'Pausar'}</button>
        <button class="perigo" id="encerrar">Encerrar sessão</button>
      </div>
      <p class="suave" style="margin:12px 0 0">Mantenha esta tela aberta. A transcrição aparece em trechos de 10 a 25 segundos.</p>
    </div>
    <div class="cartao"><h2>Transcrição</h2><div class="transcricao" id="transcricao"></div></div>`;
}

function telaEncerrada() {
  const pendentes = estado.trechos.some(t => t.pendente);
  return `${cabecalho()}
    <div class="cartao">
      <h2>Sessão encerrada</h2>
      <p class="suave">Duração: ${formatar(estado.segundos)}. ${pendentes ? 'Ainda terminando os últimos trechos…' : 'Transcrição completa.'}</p>
      <div class="linha-botoes">
        <button class="principal" id="copiar">Copiar texto</button>
        <button class="secundario" id="baixar">Baixar .txt</button>
      </div>
      <div style="margin-top:10px"><button class="secundario" id="nova" style="width:100%">Nova sessão (apaga este texto)</button></div>
    </div>
    <div class="cartao"><h2>Transcrição</h2><div class="transcricao" id="transcricao"></div></div>`;
}

function desenharTranscricao() {
  const el = document.getElementById('transcricao');
  if (!el) return;
  if (!estado.trechos.length) { el.innerHTML = '<p class="vazio">O texto vai aparecendo aqui conforme a conversa acontece.</p>'; return; }
  el.innerHTML = estado.trechos.map(t => `
    <div class="trecho ${t.pendente ? 'pendente' : ''}"><span class="tempo">${formatar(t.inicio)}</span>${escapar(t.texto)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
  if (estado.tela === 'encerrada') {
    const p = app.querySelector('.cartao .suave');
    if (p && !estado.trechos.some(t => t.pendente)) p.textContent = `Duração: ${formatar(estado.segundos)}. Transcrição completa.`;
  }
}

function desenharProgresso() {
  const itens = Object.values(estado.progresso);
  const c = itens.reduce((s, x) => s + x.c, 0), t = itens.reduce((s, x) => s + x.t, 0);
  const pct = t ? Math.round((c / t) * 100) : 0;
  const b = document.getElementById('barra-progresso'); if (b) b.style.width = `${pct}%`;
  const tx = document.getElementById('texto-progresso');
  if (tx) tx.textContent = `${pct}% · ${(c / 1e6).toFixed(0)} de ${(t / 1e6).toFixed(0)} MB`;
}

function escapar(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function desenhar() {
  app.innerHTML =
    estado.tela === 'inicio' ? telaInicio() :
    estado.tela === 'carregando' ? telaCarregando() :
    estado.tela === 'gravando' ? telaGravando() : telaEncerrada();

  if (estado.tela === 'inicio') {
    const c = document.getElementById('consent') as HTMLInputElement;
    const b = document.getElementById('iniciar') as HTMLButtonElement;
    c.onchange = () => { estado.consentimento = c.checked; b.disabled = !c.checked; };
    app.querySelectorAll<HTMLInputElement>('input[name=modelo]').forEach(r => r.onchange = () => { estado.modelo = r.value as ChaveModelo; desenhar(); });
    b.onclick = () => { if (estado.consentimento) { ligarAudioNoToque(); iniciarSessao(); } };
  }
  if (estado.tela === 'carregando') desenharProgresso();
  if (estado.tela === 'gravando') {
    document.getElementById('pausar')!.onclick = alternarPausa;
    document.getElementById('encerrar')!.onclick = () => { if (confirm('Encerrar a sessão?')) encerrar(); };
    desenharTranscricao();
  }
  if (estado.tela === 'encerrada') {
    document.getElementById('copiar')!.onclick = copiar;
    document.getElementById('baixar')!.onclick = baixar;
    document.getElementById('nova')!.onclick = novaSessao;
    desenharTranscricao();
  }
}

window.addEventListener('beforeunload', (e) => {
  if (estado.tela === 'gravando' || (estado.tela === 'encerrada' && estado.trechos.length)) { e.preventDefault(); e.returnValue = ''; }
});

desenhar();
