// Peça do Vocalpsianalise na Cloudflare (endereço vocal.pixelnexo.com.br).
// 1. Serve o app, buscando os arquivos publicados no GitHub Pages.
// 2. Em /api/transcrever, recebe um trecho de áudio WAV e devolve o texto.
// O endereço inteiro fica atrás do Cloudflare Access (lista de e-mails).
// Nenhum áudio ou texto é guardado: tudo é processado e descartado.

const ORIGEM = "https://gilsonbolivar-maker.github.io";
const BASE = "/Vocalpsianalise/";
const MODELO = "@cf/openai/whisper-large-v3-turbo";
const LIMITE_BYTES = 4 * 1024 * 1024;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname.endsWith("/api/transcrever")) {
      if (req.method !== "POST") return json({ erro: "use POST" }, 405);
      // Segunda trava: só aceita pedidos que passaram pelo Access.
      if (!req.headers.get("cf-access-jwt-assertion")) return json({ erro: "sem acesso" }, 403);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return json({ erro: "áudio vazio" }, 400);
      if (bytes.length > LIMITE_BYTES) return json({ erro: "trecho grande demais" }, 413);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      try {
        const r = await env.AI.run(MODELO, {
          audio: btoa(bin), language: "pt", task: "transcribe",
          vad_filter: true, condition_on_previous_text: false,
        });
        return json({ texto: (r.text || "").trim() });
      } catch (e) {
        const msg = String((e && e.message) || e);
        const cota = /4006|neuron|limit|quota|exceeded/i.test(msg);
        return json({ erro: cota ? "cota" : "falha" }, cota ? 429 : 502);
      }
    }

    if (url.pathname === "/" || url.pathname === BASE.slice(0, -1)) {
      return Response.redirect(url.origin + BASE + url.search, 302);
    }
    const caminho = url.pathname.startsWith(BASE) ? url.pathname : BASE.slice(0, -1) + url.pathname;
    const res = await fetch(ORIGEM + caminho + url.search, { cf: { cacheTtl: 300 } });
    const h = new Headers(res.headers);
    h.set("x-robots-tag", "noindex");
    h.set("permissions-policy", "microphone=(self)");
    return new Response(res.body, { status: res.status, headers: h });
  },
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
