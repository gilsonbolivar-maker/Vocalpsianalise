import './estilo.css';
import { TAXA, pontoDeCorte, ehQuaseSilencio, limparTexto, reduzirTaxa, rms } from './trechos';

const VERSAO = '0.1.0';
const MODELOS = {
  rapido: { id: 'onnx-community/whisper-base', nome: 'Rápido', tamanho: 'cerca de 80 MB' },
  preciso: { id: 'onnx-community/whisper-small', nome: 'Mais preciso', tamanho: 'cerca de 250 MB' },
} as const;
type ChaveModelo = keyof typeof MODELOS;

const SIMULAR = new URLSearchParams(location.search).has('simular');

interface Trecho { id: number; inicio: number; texto: string; pendente: boolean; }

const estado = {
  tela: 'inicio' as 'inicio' | 'carregando' | 'gravando' | 'encerrada',
  consentimento: false,
  modelo: 'rapido' as ChaveModelo,
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

function juntar(): Float32Array {
  const out = new Float32Array(amostrasNoBuffer);
  let o = 0;
  for (const p of pedacos) { out.set(p, o); o += p.length; }
  return out;
}

function receberAudio(bruto: Float32Array) {
  if (estado.pausado) return;
  const a = reduzirTaxa(bruto, taxaOrigem);
  pedacos.push(a);
  amostrasNoBuffer += a.length;
  amostrasTotais += a.length;
  nivelAtual = Math.min(1, rms(a) * 8);
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
  worker!.postMessage({ tipo: 'transcrever', id, audio: trecho, segundos: trecho.length / TAXA }, [trecho.buffer]);
}

async function iniciarMicrofone() {
  fluxo = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  try { ctx = new AudioContext({ sampleRate: TAXA }); }
  catch { ctx = new AudioContext(); }
  taxaOrigem = ctx.sampleRate;
  await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}gravador-worklet.js`);
  const fonte = ctx.createMediaStreamSource(fluxo);
  no = new AudioWorkletNode(ctx, 'gravador');
  no.port.onmessage = (e) => receberAudio(e.data as Float32Array);
  fonte.connect(no);
  try { travaTela = await (navigator as any).wakeLock?.request('screen'); } catch { /* sem trava de tela */ }
}

function pararMicrofone() {
  try { no?.disconnect(); } catch { /* ignora */ }
  fluxo?.getTracks().forEach(t => t.stop());
  ctx?.close();
  try { travaTela?.release(); } catch { /* ignora */ }
  no = null; fluxo = null; ctx = null; travaTela = null;
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
      const t = estado.trechos.find(x => x.id === m.id);
      if (t) {
        const limpo = limparTexto(m.texto || '');
        t.texto = m.erro ? '(falha ao transcrever este trecho)' : limpo;
        t.pendente = false;
        if (!t.texto) estado.trechos = estado.trechos.filter(x => x.id !== m.id);
        desenharTranscricao();
      }
    }
  };
  return worker;
}

async function iniciarSessao() {
  estado.erro = '';
  if (modeloCarregado === estado.modelo) { comecarGravacao(); return; }
  estado.tela = 'carregando';
  estado.progresso = {};
  desenhar();
  if (worker && modeloCarregado !== estado.modelo) { worker.terminate(); worker = null; }
  garantirWorker().postMessage({ tipo: 'carregar', modelo: MODELOS[estado.modelo].id, simular: SIMULAR });
}

async function comecarGravacao() {
  try {
    await iniciarMicrofone();
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
  relogio = window.setInterval(() => {
    if (!estado.pausado) { estado.segundos++; const r = document.getElementById('relogio'); if (r) r.textContent = formatar(estado.segundos); }
  }, 1000);
  desenhar();
}

function alternarPausa() {
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
  return `${cabecalho()}
    <div class="aviso"><b>Fase de teste.</b> Use só com dados fictícios. O programa não faz diagnóstico: ele transcreve a fala para apoiar a psicóloga.</div>
    ${estado.erro ? `<div class="aviso" style="color:var(--vermelho)">${estado.erro}</div>` : ''}
    <div class="cartao">
      <h2>Como funciona</h2>
      <ol class="passos suave">
        <li>Você confirma que o paciente concordou.</li>
        <li>O programa ouve pelo microfone e escreve o que é dito.</li>
        <li>O áudio é processado <b>só neste aparelho</b>. Nada da sessão vai para a internet.</li>
        <li>Ao encerrar, você copia ou baixa o texto. Nada fica salvo.</li>
      </ol>
    </div>
    <div class="cartao">
      <h2>Modelo de voz</h2>
      ${op('rapido')}${op('preciso')}
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
    app.querySelectorAll<HTMLInputElement>('input[name=modelo]').forEach(r => r.onchange = () => { estado.modelo = r.value as ChaveModelo; });
    b.onclick = () => { if (estado.consentimento) iniciarSessao(); };
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
