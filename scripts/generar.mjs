// Pliego Claro · generador de fichas de licitaciones TIC (datos abiertos PLACSP).
// Sin dependencias. Node >= 18. Uso: node scripts/generar.mjs [paginas]
// Lee el feed ATOM público de la Plataforma de Contratación del Sector Público,
// filtra licitaciones TIC en plazo y genera páginas estáticas en ../sitio/licitaciones.
// No guarda datos personales: omite nombres y teléfonos de contacto.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATOS = path.join(RAIZ, 'datos', 'licitaciones.json');
const SITIO = path.join(RAIZ, 'sitio');
const BASE_URL = process.env.BASE_URL || 'https://pliego-claro.github.io';
const FEED = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';
const SOLO_PUBLICAR = process.argv[2] === 'publicar';
const PAGINAS = SOLO_PUBLICAR ? 0 : Number(process.argv[2] || 40);
// CPV TIC: software y servicios TI (72, 48), equipos informáticos (302), redes (3242), telecom (642), mantenimiento TI (5031, 5032)
const CPV_TIC = /^(72|48|302|3242|642|5031|5032)/;
const CPV_FUERA = /^(50324200)$/; // 'mantenimiento preventivo' genérico: se usa para todo
// Cuenta como TIC si el CPV principal es TIC, o si la mayoría de sus CPV lo son
const esTIC = c => { const v = c.filter(Boolean).filter(x => !CPV_FUERA.test(x)); return v.length > 0 && (CPV_TIC.test(v[0]) && CPV_TIC.test(c[0] || '') || v.filter(x => CPV_TIC.test(x)).length * 2 > c.filter(Boolean).length); };

const txt = (s, re) => { const m = s.match(re); return m ? dec(m[1].trim()) : null; };
const all = (s, re) => [...s.matchAll(re)].map(m => dec(m[1].trim()));
const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = n => n == null ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €';
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const PROC = { 1: 'Abierto', 2: 'Restringido', 3: 'Negociado con publicidad', 4: 'Negociado sin publicidad', 5: 'Diálogo competitivo', 6: 'Concurso de proyectos', 9: 'Abierto simplificado', 10: 'Asociación para la innovación', 13: 'Basado en acuerdo marco', 100: 'Normas internas', 999: 'Otros' };
const TIPO = { 1: 'Suministros', 2: 'Servicios', 3: 'Obras', 21: 'Gestión de servicios públicos', 31: 'Concesión de obras', 40: 'Concesión de servicios', 7: 'Administrativo especial', 8: 'Privado', 50: 'Patrimonial' };

function parseEntrada(e) {
  const cpvs = all(e, /ItemClassificationCode[^>]*>([^<]+)</g);
  const estado = txt(e, /ContractFolderStatusCode[^>]*>([^<]+)</);
  const criterios = [...e.matchAll(/<cac:AwardingCriteria>([\s\S]*?)<\/cac:AwardingCriteria>/g)].map(m => ({
    tipo: txt(m[1], /AwardingCriteriaTypeCode[^>]*>([^<]+)</),
    desc: txt(m[1], /<cbc:Description>([^<]*)</),
    peso: Number(txt(m[1], /WeightNumeric>([^<]+)</) || 0),
  }));
  const docs = [...e.matchAll(/<cac:(LegalDocumentReference|TechnicalDocumentReference|AdditionalDocumentReference)>([\s\S]*?)<\/cac:\1>/g)].map(m => ({
    nombre: txt(m[2], /<cbc:ID>([^<]*)</), url: txt(m[2], /<cbc:URI>([^<]*)</),
  })).filter(d => d.url);
  const dur = e.match(/DurationMeasure unitCode="(\w+)">([^<]+)</);
  return {
    id: txt(e, /<id>([^<]+)</).split('/').pop(),
    expediente: txt(e, /ContractFolderID>([^<]+)</),
    titulo: txt(e, /<title>([^<]*)</),
    enlace: txt(e, /<link href="([^"]+)"/),
    actualizado: txt(e, /<updated>([^<]+)</),
    estado, cpvs,
    organo: txt(e, /<cac:PartyName>\s*<cbc:Name>([^<]+)</),
    ciudad: txt(e, /<cac:PostalAddress>\s*<cbc:CityName>([^<]+)</),
    provincia: txt(e, /RealizedLocation>\s*<cbc:CountrySubentity>([^<]+)</),
    importe: Number(txt(e, /TaxExclusiveAmount[^>]*>([^<]+)</)) || null,
    valorEstimado: Number(txt(e, /EstimatedOverallContractAmount[^>]*>([^<]+)</)) || null,
    tipo: TIPO[txt(e, /ProcurementProject>[\s\S]*?<cbc:TypeCode[^>]*>([^<]+)</)] || null,
    procedimiento: PROC[txt(e, /ProcedureCode[^>]*>([^<]+)</)] || null,
    plazoFecha: txt(e, /TenderSubmissionDeadlinePeriod>\s*<cbc:EndDate>([^<]+)</),
    plazoHora: txt(e, /TenderSubmissionDeadlinePeriod>[\s\S]*?<cbc:EndTime>([^<]+)</),
    duracion: dur ? `${dur[2]} ${({ MON: 'meses', ANN: 'años', DAY: 'días' })[dur[1]] || dur[1]}` : null,
    garantiaDefinitiva: txt(e, /RequiredFinancialGuarantee>[\s\S]*?AmountRate>([^<]+)</),
    fondosUE: /FundingProgramCode name="([^"]+)"/.test(e) ? e.match(/FundingProgramCode name="([^"]+)"/)[1] : null,
    criterios, docs,
  };
}

async function bajar(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'PliegoClaro/0.1 (datos abiertos; operado por una IA)' }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function main() {
  fs.mkdirSync(path.dirname(DATOS), { recursive: true });
  const db = fs.existsSync(DATOS) ? JSON.parse(fs.readFileSync(DATOS, 'utf8')) : {};
  let url = FEED, nuevas = 0, vistas = 0;
  for (let p = 0; p < PAGINAS && url; p++) {
    let t;
    try { t = await bajar(url); } catch (err) { console.error('Fallo al bajar', err.message); break; }
    for (const bloque of t.split('<entry>').slice(1)) {
      vistas++;
      const L = parseEntrada(bloque);
      if (!esTIC(L.cpvs)) continue;
      const previa = db[L.id];
      if (previa && previa.actualizado >= L.actualizado) continue;
      if (!previa) nuevas++;
      db[L.id] = { ...L, slug: `${slug(L.titulo || L.expediente)}-${L.id}` };
    }
    url = txt(t, /<link href="([^"]+)" rel="next"/);
    console.log(`Página ${p + 1}: ${vistas} anuncios leídos`);
  }
  fs.writeFileSync(DATOS, JSON.stringify(db, null, 1));
  console.log(`Entradas vistas: ${vistas} · TIC nuevas: ${nuevas} · TIC totales: ${Object.keys(db).length}`);
  publicar(db);
}

const hoy = () => new Date().toISOString().slice(0, 10);
const diasHasta = f => f ? Math.ceil((new Date(f + 'T23:59:59') - new Date()) / 864e5) : null;
// Puntos de juicio de valor sobre 100. Con varios lotes, los datos abiertos repiten los criterios
// de cada lote: se calcula por lote (grupos "1.x", "2.x"…) o en proporción al total.
const esMultilote = L => L.criterios.reduce((a, c) => a + c.peso, 0) > 100.5;
const pesoJuicio = L => {
  const subj = L.criterios.filter(c => c.tipo === 'SUBJ');
  const suma = subj.reduce((a, c) => a + c.peso, 0);
  const total = L.criterios.reduce((a, c) => a + c.peso, 0);
  if (total <= 100.5) return suma;
  const grupos = {};
  for (const c of subj) { const m = (c.desc || '').match(/^\s*(\d+)\s*\./); if (m) grupos[m[1]] = (grupos[m[1]] || 0) + c.peso; }
  if (Object.keys(grupos).length >= 2) return Math.max(...Object.values(grupos));
  return Math.round(suma * 100 / total);
};

const CSS = `:root{--bg:#fbfaf7;--tx:#16181b;--mu:#5d636b;--ln:#e3e0d8;--ac:#1d4ed8;--ok:#0f766e;--wa:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--tx:#e9eaec;--mu:#9aa1a9;--ln:#2a2e34;--ac:#7aa2ff;--ok:#5eead4;--wa:#fbbf24}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main,header,footer{max-width:820px;margin:0 auto;padding:0 16px}header{padding-top:20px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
a{color:var(--ac)}h1{font-size:28px;line-height:1.2;margin:18px 0 8px}h2{font-size:19px;margin:28px 0 8px}.mu{color:var(--mu)}
.ia{border:1px solid var(--ln);padding:8px 12px;font-size:14px;color:var(--mu);margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:15px}td,th{border-bottom:1px solid var(--ln);padding:8px 6px;text-align:left;vertical-align:top}
.tag{display:inline-block;font-size:12px;padding:1px 7px;border:1px solid var(--ln);border-radius:99px;margin-right:4px;white-space:nowrap}
.cta{border:2px solid var(--ac);padding:14px 16px;margin:24px 0}.cta b{font-size:18px}.btn{display:inline-block;background:var(--ac);color:#fff;padding:10px 16px;text-decoration:none;font-weight:600;margin-top:8px}
@media (prefers-color-scheme:dark){.btn{color:#0b0d10}}.lista li{margin:10px 0}footer{padding:32px 16px;font-size:13px;color:var(--mu)}
.wa{color:var(--wa)}.ok{color:var(--ok)}`;

function pagina({ titulo, descripcion, canon, cuerpo }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descripcion)}"><link rel="canonical" href="${esc(canon)}"><link rel="icon" href="${BASE_URL}/img/logo.svg" type="image/svg+xml"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'"><meta name="referrer" content="strict-origin-when-cross-origin">
<style>${CSS}</style></head><body><header><a href="${BASE_URL}/" style="font-weight:700;text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px"><img src="${BASE_URL}/img/logo.svg" alt="" width="24" height="24">Pliego Claro</a>
<nav class="mu"><a href="${BASE_URL}/licitaciones/">Licitaciones TIC en plazo</a> · <a href="${BASE_URL}/#encargar">Encargar</a></nav></header>
<main>${cuerpo}</main><footer>Pliego Claro está operado por una inteligencia artificial (Brío), con supervisión de un productor humano.
Datos: Plataforma de Contratación del Sector Público (datos abiertos). La información oficial y vinculante es la del pliego.
No es asesoramiento jurídico. · <a href="${BASE_URL}/legal/aviso-legal.html">Aviso legal</a> · <a href="${BASE_URL}/legal/privacidad.html">Privacidad</a></footer></body></html>`;
}

function ficha(L) {
  const d = diasHasta(L.plazoFecha), j = pesoJuicio(L);
  const crit = L.criterios.length ? `<table><tr><th>Criterio</th><th>Tipo</th><th>Peso</th></tr>${L.criterios.map(c => `<tr><td>${esc(c.desc)}</td><td>${c.tipo === 'SUBJ' ? 'Juicio de valor (memoria)' : c.tipo === 'OBJ' ? 'Automático (fórmula)' : esc(c.tipo)}</td><td>${c.peso || '—'}</td></tr>`).join('')}</table>`
    : '<p class="mu">El anuncio no detalla los criterios en los datos abiertos: están en el pliego.</p>';
  const lectura = j > 0
    ? `<p><b>${j} de cada 100 puntos</b>${esMultilote(L) ? ' (por lote)' : ''} se deciden por <b>juicio de valor</b>: es decir, por cómo esté escrita tu memoria técnica. El precio no lo es todo aquí.</p>`
    : '<p>Según los datos abiertos, esta licitación se decide sobre todo por criterios automáticos (precio y fórmulas). Revisa el pliego por si hay apartados técnicos.</p>';
  const cuerpo = `<p class="mu">${esc(L.expediente)} · ${esc(L.organo)}</p><h1>${esc(L.titulo)}</h1>
<p>${L.tipo ? `<span class="tag">${esc(L.tipo)}</span>` : ''}${L.procedimiento ? `<span class="tag">${esc(L.procedimiento)}</span>` : ''}${L.cpvs.filter(Boolean).slice(0, 4).map(c => `<span class="tag">CPV ${esc(c)}</span>`).join('')}</p>
<table>
<tr><th>Presupuesto (sin IVA)</th><td>${eur(L.importe)}</td></tr>
<tr><th>Valor estimado</th><td>${eur(L.valorEstimado)}</td></tr>
<tr><th>Fin de presentación</th><td>${L.plazoFecha ? `${esc(L.plazoFecha)} ${esc(L.plazoHora || '')} · <span class="${d <= 5 ? 'wa' : 'ok'}">${d >= 0 ? `quedan ${d} días` : 'plazo cerrado'}</span>` : 'Ver pliego'}</td></tr>
<tr><th>Duración</th><td>${esc(L.duracion || 'Ver pliego')}</td></tr>
<tr><th>Lugar</th><td>${esc([L.ciudad, L.provincia].filter(Boolean).join(' · ') || '—')}</td></tr>
<tr><th>Garantía definitiva</th><td>${L.garantiaDefinitiva ? esc(L.garantiaDefinitiva) + ' %' : '—'}</td></tr>
<tr><th>Fondos</th><td>${esc(L.fondosUE || '—')}</td></tr>
</table>
<h2>Cómo se gana</h2>${lectura}${crit}
<h2>Documentos oficiales</h2><ul class="lista">${L.docs.map(x => `<li><a href="${esc(x.url)}" rel="nofollow">${esc(x.nombre || 'Documento')}</a></li>`).join('') || '<li class="mu">Ver en la Plataforma</li>'}
<li><a href="${esc(L.enlace)}" rel="nofollow">Anuncio en la Plataforma de Contratación del Sector Público</a></li></ul>
<div class="cta" id="encargar"><b>¿Te presentas?</b><p>Te leo el pliego entero y te devuelvo en 24 h una ficha de decisión (requisitos de solvencia, criterios, riesgos y si te conviene), o en 72 h un borrador de memoria técnica alineado con los criterios. Lo escribe una IA y lo revisas y firmas tú.</p>
<a class="btn" href="${BASE_URL}/#encargar">Ver precios y encargar</a> &nbsp; <a href="${BASE_URL}/ejemplo-ficha.html">Ver una ficha de ejemplo</a></div>
<p class="mu">Ficha generada automáticamente el ${hoy()} a partir de datos abiertos. Puede contener errores: manda el pliego.</p>`;
  return pagina({ titulo: `${L.titulo} · ${L.organo} · Pliego Claro`.slice(0, 160), descripcion: `Licitación TIC ${L.expediente}: ${eur(L.importe)}, fin de plazo ${L.plazoFecha || 'ver pliego'}. Criterios, pesos y documentos, en claro.`, canon: `${BASE_URL}/licitaciones/${L.slug}.html`, cuerpo });
}

function publicar(db) {
  const dir = path.join(SITIO, 'licitaciones');
  fs.mkdirSync(dir, { recursive: true });
  const todas = Object.values(db);
  const enPlazo = todas.filter(L => esTIC(L.cpvs) && L.estado === 'PUB' && (diasHasta(L.plazoFecha) ?? 0) >= 0)
    .sort((a, b) => (a.plazoFecha || '9').localeCompare(b.plazoFecha || '9'));
  for (const L of enPlazo) fs.writeFileSync(path.join(dir, L.slug + '.html'), ficha(L));
  const filas = enPlazo.map(L => `<tr><td><a href="${L.slug}.html">${esc(L.titulo)}</a><div class="mu">${esc(L.organo)}</div></td><td>${eur(L.importe)}</td><td>${esc(L.plazoFecha || '—')}</td><td>${pesoJuicio(L) || '—'}</td></tr>`).join('');
  fs.writeFileSync(path.join(dir, 'index.html'), pagina({
    titulo: 'Licitaciones TIC en plazo hoy · Pliego Claro', descripcion: 'Todas las licitaciones públicas de software, servicios TI y equipos informáticos en plazo, con los criterios y los pesos en claro. Actualizado cada día.', canon: `${BASE_URL}/licitaciones/`,
    cuerpo: `<h1>Licitaciones TIC en plazo</h1><p class="mu">${enPlazo.length} licitaciones abiertas de software, servicios TI, equipos y telecomunicaciones. Actualizado el ${hoy()}. «Juicio» = puntos que dependen de la memoria técnica.</p>
<div class="ia">Esta lista la genera y la mantiene una IA a partir de los datos abiertos de la Plataforma de Contratación del Sector Público.</div>
<table><tr><th>Licitación</th><th>Importe</th><th>Fin plazo</th><th>Juicio</th></tr>${filas}</table>`
  }));
  const urls = [`${BASE_URL}/`, `${BASE_URL}/ejemplo-ficha.html`, `${BASE_URL}/licitaciones/`, ...enPlazo.map(L => `${BASE_URL}/licitaciones/${L.slug}.html`)];
  fs.writeFileSync(path.join(SITIO, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${esc(u)}</loc><lastmod>${hoy()}</lastmod></url>`).join('')}</urlset>\n`);
  // Borra fichas de licitaciones que ya no están en plazo
  const vivas = new Set(enPlazo.map(L => L.slug + '.html').concat('index.html'));
  for (const f of fs.readdirSync(dir)) if (!vivas.has(f)) fs.unlinkSync(path.join(dir, f));

  // Cifras de la portada, recalculadas cada día
  const conJ = enPlazo.filter(L => pesoJuicio(L) > 0);
  const med = a => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  const idx = path.join(SITIO, 'index.html');
  if (fs.existsSync(idx) && conJ.length) {
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const rep = (h, k, v) => h.replace(new RegExp(`<!--${k}-->[^<]*<!--/${k}-->`), `<!--${k}-->${v}<!--/${k}-->`);
    let h = fs.readFileSync(idx, 'utf8');
    h = rep(h, 'N', enPlazo.length); h = rep(h, 'F', fecha);
    h = rep(h, 'J', med(conJ.map(pesoJuicio)));
    h = rep(h, 'I', Math.round(med(conJ.map(L => L.importe || 0))).toLocaleString('es-ES'));
    fs.writeFileSync(idx, h);
  }
  console.log(`Publicadas ${enPlazo.length} fichas en plazo.`);
}

main().catch(e => { console.error(e); process.exit(1); });
