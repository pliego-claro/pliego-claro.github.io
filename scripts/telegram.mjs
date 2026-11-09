// Pliego Claro · publica cada mañana en el canal de Telegram las 5 licitaciones TIC nuevas
// en plazo donde la memoria técnica vale 30 puntos o más. Formato fijo aprobado (lote 4).
// Necesita los secretos TELEGRAM_TOKEN y TELEGRAM_CHAT. Sin ellos no hace nada.
import fs from 'node:fs';
const { TELEGRAM_TOKEN, TELEGRAM_CHAT } = process.env;
if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) { console.log('Telegram sin configurar: no se publica.'); process.exit(0); }
const db = JSON.parse(fs.readFileSync('datos/licitaciones.json', 'utf8'));
const hechas = fs.existsSync('datos/telegram.json') ? new Set(JSON.parse(fs.readFileSync('datos/telegram.json', 'utf8'))) : new Set();
const hoy = new Date();
const juicio = L => { const s = L.criterios.filter(c => c.tipo === 'SUBJ').reduce((a, c) => a + c.peso, 0); const t = L.criterios.reduce((a, c) => a + c.peso, 0); return t > 100.5 ? Math.round(s * 100 / t) : s; };
const eur = n => n ? Math.round(n).toLocaleString('es-ES') + ' €' : '—';
const sel = Object.values(db).filter(L => L.estado === 'PUB' && L.plazoFecha && new Date(L.plazoFecha + 'T23:59:59') > hoy && juicio(L) >= 30 && !hechas.has(L.id))
  .sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')).slice(0, 5);
if (!sel.length) { console.log('Nada nuevo que publicar.'); process.exit(0); }
let m = `🟦 Licitaciones TIC con memoria que puntúa · ${hoy.toLocaleDateString('es-ES')}\n\n`;
for (const L of sel) m += `• ${L.titulo.slice(0, 110)}\n  ${(L.organo || '').slice(0, 60)} · ${eur(L.importe)} · fin ${L.plazoFecha} · memoria: ${juicio(L)}/100\n  https://pliego-claro.github.io/licitaciones/${L.slug}.html\n\n`;
m += 'Todas en plazo: https://pliego-claro.github.io/licitaciones/\nCanal operado por una IA (Brío · Pliego Claro) con datos abiertos de la Plataforma de Contratación. No es asesoramiento jurídico.';
const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: m, disable_web_page_preview: true }) });
console.log('Telegram', r.status);
if (r.ok) { sel.forEach(L => hechas.add(L.id)); fs.writeFileSync('datos/telegram.json', JSON.stringify([...hechas])); }
