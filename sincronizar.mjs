// Traz para dentro do index.html o texto que foi editado pela própria página
// e ficou guardado no Supabase.
//
// Sem isto, o arquivo e a página publicada divergem: quem edita pelo site vê
// a sua versão, mas quem abre o arquivo para mexer vê a antiga — e acaba
// sobrescrevendo a revisão de alguém sem perceber.
//
// Depois de incorporar, apaga a linha no Supabase: ela vira redundante,
// porque o texto passou a viver no próprio arquivo.

import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const SUPABASE_URL = "https://vzbpbpxuedhgdpchasfc.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6YnBicHh1ZWRoZ2RwY2hhc2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTIxOTUsImV4cCI6MjA5OTQ4ODE5NX0.Y4zYHFhi75lDnylusaqWbE8Fv0ZPB091H6mAtpIE0GA";
const TABELA = "proposta_conteudo";
const ARQUIVO = "index.html";

// Mesma função de chave usada no navegador. Se as duas divergirem, a
// sincronização silenciosamente não encontra nada — por isso ficam idênticas.
function chave(txt) {
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// A lista de seletores é lida do próprio index.html, para não existir uma
// segunda cópia que possa ficar desatualizada.
function lerSeletores(html) {
  const m = html.match(/const SELETORES = \[([\s\S]*?)\];/);
  if (!m) throw new Error("Não encontrei a constante SELETORES no index.html");
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s && !s.startsWith("//"));
}

const html = readFileSync(ARQUIVO, "utf8");
const seletores = lerSeletores(html);

const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA}?select=*`, {
  headers: { apikey: SUPABASE_ANON },
});
if (!resposta.ok) throw new Error(`Supabase respondeu ${resposta.status}`);
const linhas = await resposta.json();

if (!linhas.length) {
  console.log("Nenhuma edição pendente no Supabase.");
  process.exit(0);
}

const dom = new JSDOM(html);
const doc = dom.window.document;
const porId = Object.fromEntries(linhas.map((r) => [r.id, r]));

const vistos = new Set();
const contagem = {};
const trocas = [];

for (const sel of seletores) {
  for (const el of doc.querySelectorAll(sel)) {
    if (vistos.has(el)) continue;
    vistos.add(el);
    const original = el.innerHTML.trim();
    if (!original) continue;
    const base = chave(original);
    contagem[base] = (contagem[base] || 0) + 1;
    const id = `${base}-${contagem[base]}`;

    const linha = porId[id];
    if (linha && linha.html != null && linha.html.trim() !== original) {
      trocas.push({ id, de: original, para: linha.html.trim(), por: linha.updated_by });
    }
  }
}

if (!trocas.length) {
  console.log("Nada a incorporar: o arquivo já reflete as edições salvas.");
  process.exit(0);
}

// Substituição direta no texto do arquivo, em vez de reserializar o documento
// inteiro: reescrever tudo pelo parser reformataria o HTML e produziria um
// diff gigante, além de quebrar edições futuras que dependem do texto exato.
let saida = html;
const incorporadas = [];
const puladas = [];

for (const t of trocas) {
  const ocorrencias = saida.split(t.de).length - 1;
  if (ocorrencias !== 1) {
    puladas.push({ ...t, motivo: `trecho aparece ${ocorrencias}x no arquivo` });
    continue;
  }
  saida = saida.replace(t.de, t.para);
  incorporadas.push(t);
}

if (puladas.length) {
  console.warn("Trechos não incorporados, precisam de ajuste manual:");
  for (const p of puladas) console.warn(`  · ${p.id} — ${p.motivo}`);
}

if (!incorporadas.length) {
  console.log("Nenhum trecho pôde ser incorporado com segurança.");
  process.exit(0);
}

writeFileSync(ARQUIVO, saida, "utf8");
console.log(`${incorporadas.length} trecho(s) incorporado(s) ao arquivo:`);
for (const i of incorporadas) console.log(`  · ${i.por}: "${i.para.slice(0, 60)}…"`);

// Linhas já incorporadas não servem mais: o texto agora vive no arquivo, e a
// chave delas nem bate mais, porque o original mudou.
for (const i of incorporadas) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA}?id=eq.${encodeURIComponent(i.id)}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_ANON },
  });
  if (!r.ok) console.warn(`  aviso: não consegui limpar a linha ${i.id} (${r.status})`);
}
console.log("Linhas incorporadas removidas do Supabase.");
