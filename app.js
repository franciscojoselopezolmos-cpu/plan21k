/* Plan 21K · app.js
 * Interfaz: pantallas, hojas modales, registro, copias al PC y service worker.
 * La lógica pura está en logic.js (se prueba en dev/test.html).
 */
import * as L from './logic.js';

/* ===================== Constantes de interfaz ===================== */

const TIPO = {
  descanso: { nombre: 'Descanso', letra: '–' },
  facil: { nombre: 'Fácil', letra: 'F' },
  recuperacion: { nombre: 'Recuperación', letra: 'R' },
  larga: { nombre: 'Tirada larga', letra: 'L' },
  umbral: { nombre: 'Umbral', letra: 'U' },
  ritmo: { nombre: 'Ritmo', letra: 'Rt' },
  series: { nombre: 'Series', letra: 'S' },
  cuestas: { nombre: 'Cuestas', letra: 'C' },
  fartlek: { nombre: 'Fartlek', letra: 'Fk' },
  test: { nombre: 'Test', letra: 'T' },
  carrera: { nombre: 'Carrera', letra: '21' },
  fuerza: { nombre: 'Fuerza', letra: 'G' },
};
const PARTES = {
  calentamiento: 'Calentamiento', principal: 'Principal', vuelta: 'Vuelta a la calma',
  salida: 'Salida', crucero: 'Crucero', final: 'Final',
};
const MOMENTOS = {
  'mañana': 'Por la mañana', merienda: 'Merienda', 'víspera-noche': 'Esta noche',
  durante: 'Durante el entreno', 'después': 'Después de entrenar',
};
const SENSACIONES = [['😫', 'Fatal'], ['😕', 'Mal'], ['😐', 'Normal'], ['🙂', 'Bien'], ['😄', 'Genial']];
const CHECKIN = [
  { k: 'sueno', nombre: 'Sueño', ayuda: '1 fatal · 5 genial' },
  { k: 'energia', nombre: 'Energía', ayuda: '1 sin energía · 5 a tope' },
  { k: 'piernas', nombre: 'Piernas', ayuda: '1 muy cargadas · 5 frescas' },
  { k: 'estres', nombre: 'Estrés', ayuda: '1 nada · 5 mucho' },
];
const NIVEL_TEXTO = {
  L: 'Mantiene vivo sub-1:45', T: 'Mantiene vivo el techo (sub-1:50)', A: 'Confirma A (sub-1:52)',
  B: 'Confirma B (sub-1:55)', C: 'Confirma C (sub-2:00)', alarma: 'Alarma: céntrate en C',
};
const NIVEL_CORTO = { alarma: 'Alarma', C: 'C', B: 'B', A: 'A', T: 'Techo', L: 'Sub-1:45' };
const OBJETIVOS_DEFECTO = [
  { id: 'A', tiempo: '1:51:59' }, { id: 'B', tiempo: '1:54:59' }, { id: 'C', tiempo: '1:59:59' },
  { id: 'T', tiempo: '1:49:59' }, { id: 'L', tiempo: '1:44:59' },
];
const CACHE_LS = 'plan21k.cache.';

/* ===================== Estado de la app ===================== */

const app = {
  plan: null,
  idx: null,
  vista: null,
  avisos: [],
  estado: L.estadoVacio(),
  claveEstado: L.CLAVE_ESTADO,
  hoy: L.hoyISO(),
  hoySimulado: null,
  planUrl: 'plan.json',
  modoPrueba: false,
  cargado: false,
  tab: 'hoy',
  lunesSemana: null,
  checkinAbierto: null,
  bloquesAbiertos: false,
  propuestas: [],
  borrador: null,
  hojaFecha: null,
  hojaAbierta: false,
  recargaPendiente: false,
  persistente: null,
  swReg: null,
  copiando: false,
  toastDeshacer: null,
  calcBase: 'ritmo',
  sucio: false,
};

/* ===================== Utilidades ===================== */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const ahoraISO = () => new Date().toISOString();
const r1 = n => Math.round(n * 10) / 10;
const tipoInfo = t => TIPO[t] || { nombre: t || 'Sin plan', letra: '·' };
const claseTipo = t => (TIPO[t] ? `t-${t}` : 't-ninguno');
const urlSegura = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function leerLS(clave) {
  try {
    const t = localStorage.getItem(clave);
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return null;
  }
}

function escribirLS(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    return false;
  }
}

function borrarLS(clave) {
  try { localStorage.removeItem(clave); } catch (e) { /* nada */ }
}

/* ===================== Toast ===================== */

let temporizadorToast = null;

function toast(msg, deshacer) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${deshacer ? '<button type="button" data-a="toast-deshacer">Deshacer</button>' : ''}`;
  t.hidden = false;
  app.toastDeshacer = deshacer || null;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(ocultarToast, deshacer ? 6000 : 3200);
}

function ocultarToast() {
  const t = $('#toast');
  if (t) t.hidden = true;
  app.toastDeshacer = null;
}

/* ===================== Estado persistente ===================== */

function guardar() {
  if (!escribirLS(app.claveEstado, app.estado)) {
    toast('No se han podido guardar los datos en el iPhone. Exporta una copia desde Más.');
  }
}

function setEstado(nuevo, { copia = false } = {}) {
  app.estado = L.normalizarEstado(nuevo);
  guardar();
  render();
  if (copia) copiaAlPC(false);
}

/* ===================== Arranque ===================== */

function leerParametros() {
  let p = null;
  try { p = new URLSearchParams(location.search); } catch (e) { return; }
  const h = p.get('hoy');
  if (h && L.esFechaISO(h)) {
    app.hoySimulado = h;
    app.hoy = h;
  }
  const pl = p.get('plan');
  if (pl && /^[\w\-/.]+\.json$/.test(pl) && !pl.includes('..') && !pl.startsWith('/') && !pl.includes('//')) {
    app.planUrl = pl;
  }
  app.modoPrueba = !!app.hoySimulado || app.planUrl !== 'plan.json';
  app.claveEstado = app.modoPrueba ? `${L.CLAVE_ESTADO}.prueba` : L.CLAVE_ESTADO;
}

function ponerPlan(plan) {
  app.plan = plan;
  app.idx = L.indexarPlan(plan);
  if (!app.lunesSemana) app.lunesSemana = L.lunesDe(app.hoy);
}

async function pedirJSON(url, valido) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!valido(j)) return null;
    escribirLS(CACHE_LS + url, j);
    return j;
  } catch (e) {
    return null;
  }
}

async function iniciar() {
  leerParametros();
  app.estado = L.normalizarEstado(leerLS(app.claveEstado));
  configurarEventos();
  registrarSW();
  pedirPersistencia();

  // 1) Arranque inmediato con la última copia guardada (sin esperar a la red).
  const planGuardado = leerLS(CACHE_LS + app.planUrl);
  const avisosGuardados = leerLS(CACHE_LS + 'nutricion.json');
  if (L.planValido(planGuardado)) ponerPlan(planGuardado);
  if (Array.isArray(avisosGuardados)) app.avisos = avisosGuardados;
  if (app.idx) {
    app.cargado = true;
    render();
  }

  // 2) Red o caché del service worker.
  const [plan, avisos] = await Promise.all([
    pedirJSON(app.planUrl, L.planValido),
    pedirJSON('nutricion.json', j => Array.isArray(j) && j.length > 0),
  ]);
  let cambio = !app.cargado;
  if (plan && JSON.stringify(plan) !== JSON.stringify(app.plan)) {
    ponerPlan(plan);
    cambio = true;
  }
  if (avisos && JSON.stringify(avisos) !== JSON.stringify(app.avisos)) {
    app.avisos = avisos;
    cambio = true;
  }
  app.cargado = true;
  if (cambio) render();
  copiaAlPC(false);
}

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  const habia = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habia || recargando) return;
    recargando = true;
    if (app.hojaAbierta) app.recargaPendiente = true;
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => { app.swReg = reg; }).catch(() => {});
}

async function pedirPersistencia() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    let p = await navigator.storage.persisted();
    if (!p) p = await navigator.storage.persist();
    app.persistente = p;
  } catch (e) {
    app.persistente = null;
  }
}

function alVolver() {
  let cambio = false;
  if (!app.hoySimulado) {
    const h = L.hoyISO();
    if (h !== app.hoy) {
      if (app.lunesSemana === L.lunesDe(app.hoy)) app.lunesSemana = L.lunesDe(h);
      app.hoy = h;
      app.checkinAbierto = null;
      cambio = true;
    }
  }
  if (cambio && !app.hojaAbierta) render();
  copiaAlPC(false);
  if (app.swReg) app.swReg.update().catch(() => {});
}

/* ===================== Copia al PC ===================== */

// La app vive en GitHub Pages; las copias van al servidor del PC de casa (HTTPS con la CA local
// que el iPhone ya tiene instalada). Si la app se sirve desde el propio PC, mismo origen.
const URL_PC = location.hostname === '192.168.1.41' ? '' : 'https://192.168.1.41:8443';

async function copiaAlPC(forzar) {
  if (app.modoPrueba || app.copiando) return null;
  if (!forzar && !L.necesitaCopia(app.estado.ultimaCopia, Date.now(), 12)) return null;
  app.copiando = true;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const temporizador = setTimeout(() => { if (ctrl) ctrl.abort(); }, 8000);
  try {
    const cuerpo = JSON.stringify(L.paqueteCopia(app.estado, { plan: app.plan }));
    const r = await fetch(URL_PC + '/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let j = {};
    try { j = await r.json(); } catch (errJson) { /* respuesta sin JSON */ }
    const nuevo = L.clonar(app.estado);
    nuevo.ultimaCopia = { en: ahoraISO(), fichero: j && j.file ? String(j.file) : null };
    app.estado = L.normalizarEstado(nuevo);
    guardar();
    actualizarIndicadorCopia();
    return { ok: true, fichero: nuevo.ultimaCopia.fichero };
  } catch (err) {
    return { ok: false };
  } finally {
    clearTimeout(temporizador);
    app.copiando = false;
  }
}

function actualizarIndicadorCopia() {
  const el = $('#indicador-copia');
  if (el) el.outerHTML = indicadorCopia();
  const d = $('#estado-copia');
  if (d) d.textContent = textoCopia();
}

function textoCopia() {
  const u = app.estado.ultimaCopia;
  return u ? `${L.haceTexto(u.en)}${u.fichero ? ` (${u.fichero})` : ''}` : 'nunca';
}

function indicadorCopia() {
  if (app.modoPrueba) return '<p class="copia-ind" id="indicador-copia">Modo prueba: sin copias al PC</p>';
  const u = app.estado.ultimaCopia;
  const viejo = !u || L.necesitaCopia(u, Date.now(), 24 * 7);
  return `<button type="button" class="copia-ind" id="indicador-copia" data-a="ir-datos"><span class="punto ${!u ? 'nunca' : viejo ? 'viejo' : ''}"></span>Copia en el PC: ${esc(u ? L.haceTexto(u.en) : 'nunca')}</button>`;
}

/* ===================== Render principal ===================== */

function render() {
  const main = $('#vista');
  marcarTabs();
  if (!app.idx) {
    app.vista = null;
    app.propuestas = [];
    if (!app.cargado) return;
    main.innerHTML = app.tab === 'mas' ? pantallaMas() : pantallaSinPlan();
    return;
  }
  app.vista = L.crearVista(app.idx, app.estado);
  if (app.tab === 'semana') main.innerHTML = pantallaSemana();
  else if (app.tab === 'progreso') main.innerHTML = pantallaProgreso();
  else if (app.tab === 'mas') main.innerHTML = pantallaMas();
  else main.innerHTML = pantallaHoy();
}

function marcarTabs() {
  document.querySelectorAll('#tabs [data-tab]').forEach(b => {
    if (b.dataset.tab === app.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function cambiarTab(t) {
  if (app.tab === t) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  app.tab = t;
  if (t === 'semana') app.lunesSemana = L.lunesDe(app.hoy);
  render();
  window.scrollTo(0, 0);
}

function bannerPrueba() {
  if (!app.modoPrueba) return '';
  const partes = ['Modo prueba'];
  if (app.hoySimulado) partes.push(`hoy = ${L.fechaCorta(app.hoySimulado)}`);
  if (app.planUrl !== 'plan.json') partes.push(app.planUrl);
  partes.push('datos aparte');
  return `<p class="banner-sim">${esc(partes.join(' · '))}</p>`;
}

function pantallaSinPlan() {
  return `${bannerPrueba()}
  <header class="cab"><h1>Plan 21K</h1></header>
  <section class="card vacio">
    <h2>No encuentro el plan</h2>
    <p>Falta <b>plan.json</b> junto a la app o no se ha podido leer. En casa, con el servidor del PC abierto, cierra y vuelve a abrir la app.</p>
    <a class="btn sec mt2" href="?plan=dev/plan.sample.json">Probar con el plan de muestra</a>
  </section>`;
}

/* ===================== Textos comunes ===================== */

function semanaCarrera() {
  const f = app.plan && app.plan.carrera ? app.plan.carrera.fecha : null;
  const s = f ? L.semanaDe(app.idx, f) : null;
  return s ? s.n : null;
}

function textoSemana(fecha) {
  const sem = L.semanaDe(app.idx, fecha);
  if (!sem) return '';
  const total = semanaCarrera();
  const partes = [sem.n === 0 ? 'Semana 0 · arranque' : `Semana ${sem.n}${total && sem.n <= total ? ` de ${total}` : ''}`];
  const fase = L.faseDe(app.plan, sem.n);
  if (fase && fase.nombre) partes.push(fase.nombre);
  if (sem.descarga) partes.push('descarga');
  return partes.join(' · ');
}

function planTexto(s) {
  if (!s) return '';
  if (s.tipo === 'descanso') return 'Descanso';
  const p = [];
  if (Number(s.kmPlan) > 0) p.push(`${L.fmtNum(Number(s.kmPlan), 1)} km`);
  if (Number(s.minPlan) > 0) p.push(`${Math.round(Number(s.minPlan))}'`);
  if (s.fuerza && s.tipo !== 'fuerza') p.push('+ fuerza');
  return p.join(' · ') || tipoInfo(s.tipo).nombre;
}

function realTexto(r) {
  if (!r) return '';
  if (r.estado === 'omitido') return 'omitida';
  const p = [];
  if (r.km) p.push(`${L.fmtNum(r.km, 2)} km`);
  if (r.tiempo) p.push(L.formatearTiempo(r.tiempo));
  if (r.km && r.tiempo) p.push(`${L.formatearRitmo(r.tiempo / r.km)}/km`);
  if (r.fcMedia) p.push(`${r.fcMedia} ppm`);
  if (r.rpe) p.push(`RPE ${r.rpe}`);
  if (r.sensaciones && SENSACIONES[r.sensaciones - 1]) p.push(SENSACIONES[r.sensaciones - 1][0]);
  if (r.dolor > 0) p.push(`dolor ${r.dolor}${r.zonaDolor && r.zonaDolor.length ? ` (${r.zonaDolor.join(', ')})` : ''}`);
  if (r.fuerzaHecha) p.push('fuerza ✓');
  if (r.tiempoOficial) p.push(`oficial ${L.formatearTiempo(r.tiempoOficial)}`);
  if (r.ritmoTest) p.push(`bloques a ${L.formatearRitmo(r.ritmoTest)}/km`);
  return p.join(' · ') || (r.estado === 'parcial' ? 'en parte' : 'hecha');
}

function chipsSesion(s) {
  const c = [`<span class="chip tipo">${esc(tipoInfo(s.tipo).nombre)}</span>`];
  if (Number(s.kmPlan) > 0) c.push(`<span class="chip">${L.fmtNum(Number(s.kmPlan), 1)} km</span>`);
  if (Number(s.minPlan) > 0) c.push(`<span class="chip">${Math.round(Number(s.minPlan))} min</span>`);
  if (s.clave) c.push('<span class="chip acento">Clave</span>');
  if (s.geles) c.push('<span class="chip acento">Practica gel</span>');
  if (s.fuerza && s.tipo !== 'fuerza') c.push('<span class="chip">+ Fuerza</span>');
  return `<div class="chips">${c.join('')}</div>`;
}

function pasosHtml(s, abierto) {
  const b = Array.isArray(s.bloques) ? s.bloques.filter(x => x && x.texto) : [];
  if (!b.length) return '';
  const lista = `<ol class="pasos">${b.map(x => `<li><span class="parte">${esc(PARTES[x.parte] || L.capitalizar(String(x.parte || '')))}</span>${esc(x.texto)}</li>`).join('')}</ol>`;
  if (abierto) return `<div class="mt">${lista}</div>`;
  return `<details class="bloques"${app.bloquesAbiertos ? ' open' : ''}><summary>Ver la sesión paso a paso</summary>${lista}</details>`;
}

function notasAjuste(s) {
  let h = '';
  if (s.ajuste) {
    h += `<p class="nota-ajuste"><span>✎ Ajustada: ${esc(s.ajuste.texto)}</span><button type="button" class="link" data-a="deshacer-ajuste" data-id="${esc(s.ajuste.id)}">Deshacer</button></p>`;
  }
  if (s.movida) h += `<p class="nota-mov">⇄ Movida desde el ${esc(L.fechaLarga(s.fechaOriginal))}</p>`;
  return h;
}

function filaFuerza(s) {
  const rut = app.plan && app.plan.fuerza ? app.plan.fuerza[s.fuerza] : null;
  const nombre = rut && rut.nombre ? rut.nombre : `Rutina ${s.fuerza}`;
  const n = rut && Array.isArray(rut.ejercicios) ? rut.ejercicios.length : 0;
  const hechos = Object.values(app.estado.fuerza[s.fecha] || {}).filter(x => x && x.hecho).length;
  const sub = [s.tipo === 'fuerza' ? '' : 'Después de correr', rut && rut.duracionMin ? `${rut.duracionMin}'` : '', n ? `${hechos}/${n} ejercicios` : '']
    .filter(Boolean).join(' · ');
  return `<button type="button" class="fila-fuerza t-fuerza" data-a="detalle" data-fecha="${esc(s.fecha)}" data-ir="fuerza">
    <span class="badge">G</span><span><b>${esc(nombre)}</b>${esc(sub)}</span><span class="chev">›</span></button>`;
}

function resumenRegistro(r) {
  const omit = r.estado === 'omitido';
  const titulo = { hecho: 'Hecho', parcial: 'Hecho en parte', omitido: 'Omitida' }[r.estado] || 'Registrado';
  const ico = omit ? '✕' : r.estado === 'parcial' ? '½' : '✓';
  const det = omit ? (r.notas || '') : realTexto(r);
  return `<div class="registrado ${omit ? 'omitido' : ''}"><span class="estado-ico">${ico}</span><div><b>${titulo}</b>${esc(det)}</div></div>`;
}

function textoResultado(res) {
  if (!res) return '';
  return res.esRitmo ? `${L.formatearRitmo(res.segundos)}/km` : L.formatearTiempo(res.segundos);
}

function chipNivel(cl) {
  if (!cl || !cl.nivel) return '';
  const txt = cl.nivel === 'C' && cl.implicito ? 'Vía C: B sin confirmar' : NIVEL_TEXTO[cl.nivel] || cl.nivel;
  return `<span class="nivel ${esc(cl.nivel)}">${esc(txt)}</span>`;
}

/* ===================== Pantalla HOY ===================== */

function pantallaHoy() {
  const hoy = app.hoy;
  const s = app.vista.sesion(hoy);
  const manana = L.sumarDias(hoy, 1);
  const sm = app.vista.sesion(manana);
  app.propuestas = L.evaluarReglas({ idx: app.idx, estado: app.estado, hoy, vista: app.vista });
  const test = s ? L.testDeFecha(app.plan, s.fechaOriginal) : null;
  return `${bannerPrueba()}
  <header class="cab">
    <p class="cab-fecha">${esc(L.fechaLarga(hoy))}</p>
    <h1>Hoy</h1>
    <p class="cab-sub">${esc(textoSemana(hoy) || (app.plan.muestra ? 'Plan de muestra' : ''))}</p>
  </header>
  ${tarjetaCuentaAtras()}
  ${app.propuestas.map(tarjetaPropuesta).join('')}
  ${s ? tarjetaSesion(s) : tarjetaSinSesion()}
  ${test ? tarjetaTest(test) : ''}
  ${bloqueNutricion()}
  ${bloqueCheckin()}
  ${sm ? tarjetaManana(sm, manana) : ''}
  ${indicadorCopia()}`;
}

function tarjetaCuentaAtras() {
  const c = app.plan.carrera;
  if (!c || !L.esFechaISO(c.fecha)) return '';
  const ca = L.cuentaAtras(app.hoy, c.fecha);
  let num;
  let txt;
  if (ca.dias > 0) {
    num = `${ca.dias}<small>${ca.dias === 1 ? 'día' : 'días'}</small>`;
    txt = ca.semanas > 0
      ? `Faltan ${plural(ca.semanas, 'semana', 'semanas')}${ca.resto ? ` y ${plural(ca.resto, 'día', 'días')}` : ''}`
      : `Faltan ${plural(ca.dias, 'día', 'días')}`;
  } else if (ca.dias === 0) {
    num = '🏁';
    txt = '¡Hoy es el día!';
  } else {
    num = '✓';
    txt = `Carrera hecha hace ${plural(-ca.dias, 'día', 'días')}`;
  }
  const detalle = [c.nombre, L.fechaCorta(c.fecha), c.hora].filter(Boolean).join(' · ');
  return `<section class="card cuenta"><div class="cuenta-num">${num}</div><div class="cuenta-txt"><b>${esc(txt)}</b><span>${esc(detalle)}</span></div></section>`;
}

function checkinCompleto(c) {
  return !!c && CHECKIN.every(x => c[x.k] != null) && c.dolor != null;
}

function bloqueCheckin() {
  const c = app.estado.checkins[app.hoy] || {};
  const completo = checkinCompleto(c);
  const abierto = app.checkinAbierto ?? !completo;
  const resumen = completo
    ? `${CHECKIN.map(x => `${x.nombre} ${c[x.k]}`).join(' · ')} · Dolor ${c.dolor}`
    : 'Toca 5 cosas y listo: unos 10 segundos.';
  let h = `<section class="card ck">
    <button type="button" class="ck-cab" data-a="ck-toggle" aria-expanded="${abierto}">
      <span class="ico" aria-hidden="true">${completo ? '✅' : '📝'}</span>
      <span><b>${completo ? 'Check-in hecho' : '¿Cómo estás hoy?'}</b><small>${esc(resumen)}</small></span>
      <span class="chev">${abierto ? '⌃' : '⌄'}</span>
    </button>`;
  if (abierto) {
    for (const x of CHECKIN) {
      h += `<div class="ck-fila"><div class="ck-lab"><span>${x.nombre}</span><small>${x.ayuda}</small></div>
        <div class="seg">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-a="ck" data-k="${x.k}" data-v="${v}" aria-pressed="${c[x.k] === v}" aria-label="${x.nombre} ${v}">${v}</button>`).join('')}</div></div>`;
    }
    const d = c.dolor;
    h += `<div class="ck-fila"><div class="ck-lab"><span>Dolor</span><small>0 nada · 10 insoportable</small></div>
      <div class="rango-fila">
        <input class="rango ${d == null ? 'sin-valor' : ''}" type="range" min="0" max="10" step="1" value="${d ?? 0}" data-c="ck-dolor" aria-label="Dolor de 0 a 10">
        <output class="rango-val" id="ck-dolor-val">${d ?? '–'}</output>
        <button type="button" class="chip-btn" data-a="ck" data-k="dolor" data-v="0" aria-pressed="${d === 0}">Sin dolor</button>
      </div></div>`;
  }
  return `${h}</section>`;
}

function tarjetaPropuesta(p) {
  const etiqueta = { alerta: 'Atención', propuesta: 'Propuesta de ajuste', aviso: 'Aviso' }[p.nivel] || 'Aviso';
  const botones = p.opciones.map(o => `<button type="button" class="btn ${o.principal ? 'primario' : ''}" data-a="prop" data-id="${esc(p.id)}" data-op="${esc(o.id)}">${esc(o.texto)}</button>`).join('');
  return `<section class="card prop ${esc(p.nivel)}"><p class="eyebrow">${etiqueta}</p><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p><div class="prop-acc">${botones}</div></section>`;
}

function tarjetaSesion(s) {
  const r = app.estado.registros[s.fecha];
  const ti = tipoInfo(s.tipo);
  return `<article class="card sesion ${claseTipo(s.tipo)}">
    <button type="button" class="sesion-cab" data-a="detalle" data-fecha="${esc(s.fecha)}">
      <span class="badge">${esc(ti.letra)}</span>
      <span class="sesion-tit"><small>${esc(ti.nombre)}${s.clave ? ' · clave' : ''}</small><strong>${esc(s.titulo)}</strong></span>
      <span class="chev">›</span>
    </button>
    ${s.objetivo && s.tipo !== 'descanso' ? `<p class="objetivo">${esc(s.objetivo)}</p>` : ''}
    ${chipsSesion(s)}
    ${notasAjuste(s)}
    ${pasosHtml(s, false)}
    ${s.porque ? `<p class="porque"><b>Por qué:</b> ${esc(s.porque)}</p>` : ''}
    ${s.alternativa ? `<p class="alt"><b>Plan B:</b> ${esc(s.alternativa)}</p>` : ''}
    ${s.fuerza ? filaFuerza(s) : ''}
    ${accionesHoy(s, r)}
  </article>`;
}

function accionesHoy(s, r) {
  const f = esc(s.fecha);
  if (r) {
    return `${resumenRegistro(r)}<div class="acciones dos"><button type="button" class="btn peq" data-a="registrar" data-fecha="${f}">Editar</button><button type="button" class="btn peq" data-a="detalle" data-fecha="${f}">Ver detalle</button></div>`;
  }
  if (!L.planificada(s)) {
    return `<p class="porque">Día de descanso. Si haces algo, regístralo.</p><div class="acciones"><button type="button" class="btn peq" data-a="registrar" data-fecha="${f}">Registrar actividad</button></div>`;
  }
  const esTest = s.tipo === 'test' || s.tipo === 'carrera';
  if (esTest) {
    return `<div class="acciones"><button type="button" class="btn primario grande" data-a="registrar" data-fecha="${f}">Registrar resultado</button></div>`;
  }
  return `<div class="acciones">
    <button type="button" class="btn primario grande" data-a="hecho" data-fecha="${f}">✓ Hecho tal cual</button>
    <button type="button" class="btn sec" data-a="registrar" data-fecha="${f}">Registrar</button>
  </div>`;
}

function tarjetaSinSesion() {
  const { primerDia, ultimoDia } = app.idx;
  let txt = 'No hay sesión en el plan para hoy.';
  if (primerDia && app.hoy < primerDia) txt = `El plan empieza el ${L.fechaLarga(primerDia)}.`;
  else if (ultimoDia && app.hoy > ultimoDia) txt = 'El plan ha terminado. ¡Enhorabuena por el bloque!';
  return `<section class="card vacio"><p>${esc(txt)}</p></section>`;
}

function infoNutri(fecha) {
  const sem = L.semanaDe(app.idx, fecha);
  return {
    carreraFecha: app.plan.carrera ? app.plan.carrera.fecha : null,
    descarga: !!(sem && sem.descarga),
    semanaN: sem ? sem.n : null,
  };
}

function avisoPara(fecha) {
  const v = app.vista;
  return L.avisoDelDia(app.avisos, v.sesion(fecha), v.sesion(L.sumarDias(fecha, 1)), fecha, infoNutri(fecha));
}

function bloqueNutricion() {
  const hoy = app.hoy;
  const a = avisoPara(hoy);
  const b = avisoPara(L.sumarDias(hoy, 1));
  if (!a && !b) return '';
  const c = app.estado.checkins[hoy];
  const extra = c && c.sueno != null && c.sueno <= 2 ? L.elegirAviso(app.avisos, 'Si duermes mal', hoy) : null;
  return `<section class="card nutri">
    <p class="eyebrow">🍽 Nutrición de hoy${a ? ` · ${esc(a.contexto)}` : ''}</p>
    ${a ? `<p class="nutri-txt">${esc(a.texto)}</p>${a.momento ? `<p class="nutri-mom">${esc(MOMENTOS[a.momento] || a.momento)}</p>` : ''}` : '<p class="nutri-txt">Hoy, comida normal y variada.</p>'}
    ${extra ? `<p class="nutri-extra">😴 ${esc(extra.texto)}</p>` : ''}
    ${b ? `<p class="nutri-man"><b>Mañana · ${esc(b.contexto)}:</b> ${esc(b.texto)}</p>` : ''}
  </section>`;
}

function tarjetaManana(s, fecha) {
  const ti = tipoInfo(s.tipo);
  const sub = [planTexto(s), s.tipo !== 'descanso' ? s.objetivo : ''].filter(Boolean).join(' · ');
  return `<p class="seccion">Mañana</p>
  <button type="button" class="card manana ${claseTipo(s.tipo)}" data-a="detalle" data-fecha="${esc(fecha)}">
    <span class="badge">${esc(ti.letra)}</span>
    <span><small>${esc(L.fechaLarga(fecha))}</small><b>${esc(s.titulo)}</b><em>${esc(sub)}</em></span>
    <span class="chev">›</span>
  </button>`;
}

function tarjetaTest(t) {
  const res = app.estado.tests[t.fecha];
  const cl = res ? L.clasificarTest(res.segundos, t.segundos) : null;
  const umbr = t.umbrales && typeof t.umbrales === 'object'
    ? Object.entries(t.umbrales).map(([k, v]) => `<dt>${esc(NIVEL_CORTO[k] || k)}</dt><dd>${esc(v)}</dd>`).join('')
    : '';
  const url = urlSegura(t.url);
  return `<section class="card test-card">
    <p class="eyebrow">Test · ${esc(L.fechaCorta(t.fecha))}${t.hora ? ` · ${esc(t.hora)}` : ''}</p>
    <h3 class="mt">${esc(t.nombre || 'Test')}</h3>
    <p class="muted">${esc([t.distancia, t.lugar].filter(Boolean).join(' · '))}</p>
    ${res ? `<p class="mt">Resultado: <b>${esc(textoResultado(res))}</b> ${chipNivel(cl)}</p>` : ''}
    ${umbr ? `<dl class="umbrales">${umbr}</dl>` : ''}
    ${t.inscripcion ? `<p class="porque">${esc(t.inscripcion)}</p>` : ''}
    ${url ? `<p class="mt"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Inscripción e información ↗</a></p>` : ''}
  </section>`;
}

function tarjetaCarrera(c) {
  const url = urlSegura(c.url);
  const res = app.estado.tests[c.fecha];
  return `<section class="card test-card">
    <p class="eyebrow">Carrera objetivo · ${esc(L.fechaCorta(c.fecha))}${c.hora ? ` · ${esc(c.hora)}` : ''}</p>
    <h3 class="mt">${esc(c.nombre || 'Carrera')}</h3>
    <p class="muted">${esc([c.lugar, c.distanciaKm ? `${L.fmtNum(c.distanciaKm, 4)} km` : ''].filter(Boolean).join(' · '))}</p>
    ${res ? `<p class="mt">Resultado: <b>${esc(L.formatearTiempo(res.segundos))}</b></p>` : ''}
    ${c.inscripcion ? `<p class="porque">${esc(c.inscripcion)}</p>` : ''}
    ${url ? `<p class="mt"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Inscripción e información ↗</a></p>` : ''}
  </section>`;
}

/* ===================== Pantalla SEMANA ===================== */

function pantallaSemana() {
  const lunes = app.lunesSemana || L.lunesDe(app.hoy);
  const r = L.resumenSemana(app.idx, app.estado, app.vista, lunes, app.hoy);
  const sem = r.semana;
  const fase = sem ? L.faseDe(app.plan, sem.n) : null;
  const primera = app.idx.semanas[0];
  const ultima = app.idx.semanas[app.idx.semanas.length - 1];
  const puedeAtras = !!primera && lunes > L.lunesDe(primera.inicio);
  const puedeAlante = !!ultima && lunes < L.lunesDe(ultima.inicio);
  const esEsta = lunes === L.lunesDe(app.hoy);
  const pct = r.kmPlan > 0 ? Math.min(100, Math.round((r.kmHechos / r.kmPlan) * 100)) : 0;
  const sub = [fase && fase.nombre, sem && sem.titulo, sem && sem.descarga ? 'descarga' : ''].filter(Boolean).join(' · ');
  return `${bannerPrueba()}
  <header class="cab">
    <p class="cab-fecha">${esc(L.rangoSemanaTexto(lunes))}</p>
    <h1>${sem ? `Semana ${sem.n}` : 'Semana'}</h1>
    <p class="cab-sub">${esc(sub || (sem ? '' : 'Fuera del plan'))}</p>
  </header>
  <div class="semana-nav">
    <button type="button" class="btn-ico" data-a="sem-prev" aria-label="Semana anterior" ${puedeAtras ? '' : 'disabled'}>‹</button>
    <div class="centro">${esEsta ? '<b>Esta semana</b>' : '<button type="button" class="link" data-a="sem-hoy">Volver a hoy</button>'}</div>
    <button type="button" class="btn-ico" data-a="sem-next" aria-label="Semana siguiente" ${puedeAlante ? '' : 'disabled'}>›</button>
  </div>
  <section class="card">
    <div class="tira">${r.dias.map(diaTira).join('')}</div>
    <div class="km-semana">
      <div class="fila"><span class="muted">Kilómetros</span><span><b>${L.fmtNum(r.kmHechos, 1) || '0'}</b> <span class="muted">/ ${L.fmtNum(r.kmPlan, 1) || '0'} km</span></span></div>
      <div class="barra-km" role="img" aria-label="${pct} % de los km planificados"><span style="width:${pct}%"></span></div>
    </div>
  </section>
  ${sem && sem.nota ? `<section class="card"><p class="eyebrow">Nota de la semana</p><p class="mt">${esc(sem.nota)}</p></section>` : ''}
  ${testsSemana(lunes)}
  <div class="lista">${r.dias.map(filaDia).join('')}</div>`;
}

function diaTira(d) {
  const s = d.sesion;
  const ti = tipoInfo(s && s.tipo);
  const marcas = {
    hecho: ['hecho', '✓'], parcial: ['parcial', '½'], omitido: ['omitido', '✕'],
    descanso: ['descanso', '·'], 'sin-registrar': ['sin-registrar', '?'],
  };
  const [cls, cont] = marcas[d.estado] || ['', ti.letra];
  const dia = L.parseISO(d.fecha).getDate();
  const etiqueta = `${L.fechaLarga(d.fecha)}: ${s ? s.titulo : 'sin plan'}`;
  return `<button type="button" class="${claseTipo(s && s.tipo)}${d.fecha === app.hoy ? ' es-hoy' : ''}" data-a="detalle" data-fecha="${esc(d.fecha)}" aria-label="${esc(etiqueta)}">
    <span class="dl">${L.DIAS_LETRA[L.diaSemana(d.fecha)]}</span><span class="dn">${dia}</span>
    <span class="circ ${cls}">${esc(cont)}</span><span class="mv">${s && s.movida ? '⇄' : s && s.ajuste ? '✎' : ''}</span></button>`;
}

function filaDia(d) {
  const s = d.sesion;
  const r = d.registro;
  const ti = tipoInfo(s && s.tipo);
  const marcas = {
    hecho: ['✓', 'ok'], parcial: ['◐', 'ok'], omitido: ['✕', 'mal'], 'sin-registrar': ['?', 'aviso'], hoy: ['•', 'aviso'],
  };
  const [ico, cls] = marcas[d.estado] || ['', ''];
  const extra = [s && s.movida ? 'movida' : '', s && s.ajuste ? 'ajustada' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="li ${claseTipo(s && s.tipo)}${d.fecha === app.hoy ? ' es-hoy' : ''}" data-a="detalle" data-fecha="${esc(d.fecha)}">
    <span class="badge">${esc(ti.letra)}</span>
    <span class="li-cuerpo"><small>${esc(L.fechaCorta(d.fecha))}${extra ? ` · ${esc(extra)}` : ''}</small><b>${esc(s ? s.titulo : 'Sin plan')}</b>
      <em>Plan: ${esc(planTexto(s) || '—')}</em>${r ? `<em>Real: ${esc(realTexto(r))}</em>` : ''}</span>
    <span class="li-der"><span class="est ${cls}">${ico}</span></span>
  </button>`;
}

function testsSemana(lunes) {
  const dom = L.sumarDias(lunes, 6);
  const tests = (Array.isArray(app.plan.tests) ? app.plan.tests : []).filter(t => t && t.fecha >= lunes && t.fecha <= dom);
  let h = tests.map(tarjetaTest).join('');
  const c = app.plan.carrera;
  if (c && c.fecha >= lunes && c.fecha <= dom) h += tarjetaCarrera(c);
  return h;
}

/* ===================== Hoja: DETALLE ===================== */

function cabHoja(titulo, izq = 'Cerrar', der = '') {
  return `<div class="hoja-cab"><span class="grabber" aria-hidden="true"></span><div class="hoja-barra">
    <button type="button" class="link izq" data-a="cerrar-hoja">${esc(izq)}</button>
    <h2>${esc(titulo)}</h2>
    <span class="der">${der}</span></div></div>`;
}

function abrirHoja(html) {
  const fondo = $('#hoja-fondo');
  const hoja = $('#hoja');
  hoja.innerHTML = html;
  fondo.hidden = false;
  document.documentElement.classList.add('hoja-abierta');
  app.hojaAbierta = true;
  hoja.scrollTop = 0;
  ajustarViewport();
}

function cerrarHoja() {
  const fondo = $('#hoja-fondo');
  if (fondo) fondo.hidden = true;
  const hoja = $('#hoja');
  if (hoja) hoja.innerHTML = '';
  document.documentElement.classList.remove('hoja-abierta');
  app.hojaAbierta = false;
  app.borrador = null;
  app.hojaFecha = null;
  if (app.recargaPendiente) {
    location.reload();
    return;
  }
  if (app.sucio) {
    app.sucio = false;
    render();
  }
}

function ajustarViewport() {
  const vv = window.visualViewport;
  const fondo = $('#hoja-fondo');
  if (!vv || !fondo) return;
  fondo.style.top = `${vv.offsetTop}px`;
  fondo.style.height = `${vv.height}px`;
}

function abrirDetalle(fecha, irA) {
  app.hojaFecha = fecha;
  abrirHoja(htmlDetalle(fecha, false));
  if (irA === 'fuerza') {
    const sec = $('#hoja .bloque-fuerza');
    if (sec) setTimeout(() => sec.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
  }
}

function htmlDetalle(fecha, mover) {
  const s = app.vista.sesion(fecha);
  const r = app.estado.registros[fecha];
  const cab = cabHoja(L.capitalizar(L.fechaCorta(fecha)));
  if (!s) {
    return `${cab}<section class="card vacio"><p>No hay sesión del plan este día.</p></section>
      ${fecha <= app.hoy ? `<div class="acciones"><button type="button" class="btn sec" data-a="registrar" data-fecha="${esc(fecha)}">Registrar actividad</button></div>` : ''}`;
  }
  const ti = tipoInfo(s.tipo);
  const nutri = avisoPara(fecha);
  const test = L.testDeFecha(app.plan, s.fechaOriginal);
  const semana = textoSemana(fecha);
  return `${cab}
  <div class="hoja-tit ${claseTipo(s.tipo)}"><span class="badge">${esc(ti.letra)}</span>
    <span><small>${esc(ti.nombre)}${s.clave ? ' · sesión clave' : ''}</small><strong>${esc(s.titulo)}</strong></span></div>
  <p class="muted peq">${esc(L.capitalizar(L.fechaLarga(fecha)))}${semana ? ` · ${esc(semana)}` : ''}</p>
  <section class="card mt ${claseTipo(s.tipo)}">
    ${s.objetivo ? `<p class="objetivo" style="margin-top:0">${esc(s.objetivo)}</p>` : ''}
    ${chipsSesion(s)}
    ${notasAjuste(s)}
    ${pasosHtml(s, true)}
    ${s.porque ? `<p class="porque"><b>Por qué:</b> ${esc(s.porque)}</p>` : ''}
    ${s.alternativa ? `<p class="alt"><b>Plan B:</b> ${esc(s.alternativa)}</p>` : ''}
    ${r ? resumenRegistro(r) : ''}
  </section>
  ${test ? tarjetaTest(test) : ''}
  ${s.fuerza ? bloqueFuerza(s, fecha) : ''}
  ${nutri ? `<section class="card"><p class="eyebrow">🍽 Nutrición · ${esc(nutri.contexto)}</p><p class="mt">${esc(nutri.texto)}</p></section>` : ''}
  ${accionesDetalle(s, r, fecha, mover)}`;
}

function bloqueFuerza(s, fecha) {
  const rut = app.plan.fuerza ? app.plan.fuerza[s.fuerza] : null;
  if (!rut) {
    return `<section class="card t-fuerza bloque-fuerza"><p class="eyebrow">Fuerza</p><h3 class="mt">Rutina ${esc(s.fuerza)}</h3><p class="muted">Esta rutina no está en el plan.</p></section>`;
  }
  const fz = app.estado.fuerza[fecha] || {};
  const ejs = Array.isArray(rut.ejercicios) ? rut.ejercicios : [];
  const filas = ejs.map((ej, i) => {
    const est = fz[i] || {};
    const carga = est.carga ?? app.estado.cargas[ej.nombre] ?? '';
    const det = [ej.series ? `${ej.series}×${ej.reps || ''}` : ej.reps, ej.carga, ej.descanso ? `desc. ${ej.descanso}` : '', ej.nota]
      .filter(Boolean).join(' · ');
    return `<div class="ej">
      <label class="chk"><input type="checkbox" class="check" data-c="ej" data-fecha="${esc(fecha)}" data-i="${i}" ${est.hecho ? 'checked' : ''} aria-label="${esc(ej.nombre)} hecho"></label>
      <div class="ej-nom"><b>${esc(ej.nombre)}</b><em>${esc(det)}</em></div>
      <input class="txt" type="text" autocomplete="off" placeholder="Carga (p. ej. 20 kg)" value="${esc(carga)}" data-c="ej-carga" data-fecha="${esc(fecha)}" data-i="${i}" data-nombre="${esc(ej.nombre)}" aria-label="Carga de ${esc(ej.nombre)}">
    </div>`;
  }).join('');
  return `<section class="card t-fuerza bloque-fuerza">
    <p class="eyebrow">Gimnasio${s.tipo === 'fuerza' ? '' : ' · después de correr'}</p>
    <h3 class="mt">${esc(rut.nombre || s.fuerza)}${rut.duracionMin ? ` · ${esc(rut.duracionMin)}'` : ''}</h3>
    ${rut.calentamiento ? `<p class="porque">Calentamiento: ${esc(rut.calentamiento)}</p>` : ''}
    ${rut.nota ? `<p class="porque">${esc(rut.nota)}</p>` : ''}
    <div class="mt">${filas}</div>
  </section>`;
}

function accionesDetalle(s, r, fecha, mover) {
  const f = esc(fecha);
  const futura = fecha > app.hoy;
  const esTest = s.tipo === 'test' || s.tipo === 'carrera';
  const b = [];
  if (!futura && !r && L.planificada(s) && !esTest) b.push(`<button type="button" class="btn primario grande" data-a="hecho" data-fecha="${f}">✓ Hecho tal cual</button>`);
  if (!futura) b.push(`<button type="button" class="btn ${r || esTest || !L.planificada(s) ? 'primario grande' : 'sec'}" data-a="registrar" data-fecha="${f}">${r ? 'Editar registro' : esTest ? 'Registrar resultado' : 'Registrar'}</button>`);
  if (!r) b.push(`<button type="button" class="btn sec" data-a="mover-abrir" data-fecha="${f}">Mover a…</button>`);
  if (!r && L.planificada(s)) b.push(`<button type="button" class="btn" data-a="omitir" data-fecha="${f}">Omitir</button>`);
  if (r) b.push(`<button type="button" class="btn peligro" data-a="borrar-registro" data-fecha="${f}">Borrar registro</button>`);
  return `<div class="acciones mt2">${b.join('')}</div>${mover && !r ? panelMover(fecha) : ''}`;
}

function panelMover(fecha) {
  const ops = L.opcionesMover(app.idx, app.estado, fecha, app.hoy);
  const filas = ops.map(o => {
    const s = o.sesion;
    const ti = tipoInfo(s && s.tipo);
    const aviso = o.aviso
      ? `<span class="mover-aviso">⚠︎ Quedarían dos días duros seguidos (${L.DIAS_CORTO[L.diaSemana(o.aviso[0])]} y ${L.DIAS_CORTO[L.diaSemana(o.aviso[1])]})</span>`
      : '';
    return `<button type="button" class="li ${claseTipo(s && s.tipo)}" data-a="mover-a" data-desde="${esc(fecha)}" data-hasta="${esc(o.fecha)}" data-aviso="${o.aviso ? 1 : 0}" ${o.disponible ? '' : 'disabled'}>
      <span class="badge">${esc(ti.letra)}</span>
      <span class="li-cuerpo"><small>${esc(L.fechaCorta(o.fecha))}</small><b>${esc(s ? s.titulo : '—')}</b>${o.motivo ? `<em>${esc(o.motivo)}</em>` : ''}${aviso}</span>
      <span class="li-der">${o.disponible ? '⇄' : ''}</span></button>`;
  }).join('');
  return `<p class="seccion" id="mover-panel">Mover a otro día de esta semana</p>
    <div class="lista mover-lista">${filas}</div>
    <p class="peq muted">Las dos sesiones se intercambian el día.</p>`;
}

/* ===================== Hoja: REGISTRAR ===================== */

function abrirRegistro(fecha) {
  if (fecha > app.hoy) return;
  const s = app.vista.sesion(fecha) || { tipo: 'descanso', titulo: 'Actividad extra', kmPlan: 0, minPlan: 0, fecha, fechaOriginal: fecha };
  const r = app.estado.registros[fecha] || null;
  const conFuerza = !!(s.fuerza || s.tipo === 'fuerza');
  const claveTest = s.fechaOriginal || fecha;
  const planTest = L.testDeFecha(app.plan, claveTest);
  const esTest = s.tipo === 'test' || s.tipo === 'carrera' || !!planTest;
  const porRitmo = !!planTest && L.umbralesSonRitmo(planTest.segundos);
  const res = esTest ? app.estado.tests[claveTest] : null;
  const distOficial = res && res.distanciaKm ? res.distanciaKm
    : planTest && planTest.distanciaKm ? planTest.distanciaKm
      : s.tipo === 'carrera' ? ((app.plan.carrera && app.plan.carrera.distanciaKm) || L.DIST_MEDIA) : null;

  app.borrador = {
    fecha, esTest, claveTest, porRitmo,
    distTest: planTest && planTest.distanciaKm ? Number(planTest.distanciaKm) : null,
    nombreTest: (planTest && planTest.nombre) || s.titulo,
    estado: r ? r.estado || 'hecho' : 'hecho',
    rpe: r ? r.rpe ?? null : null,
    sens: r ? r.sensaciones ?? null : null,
    dolor: r && r.dolor != null ? r.dolor : 0,
    zonas: new Set(r && Array.isArray(r.zonaDolor) ? r.zonaDolor : []),
  };
  const b = app.borrador;
  const km = r ? r.km : Number(s.kmPlan) > 0 ? Number(s.kmPlan) : null;
  const tiempo = r ? r.tiempo : Number(s.minPlan) > 0 && s.tipo !== 'fuerza' ? Math.round(Number(s.minPlan) * 60) : null;
  const fuerzaHecha = r ? !!r.fuerzaHecha : conFuerza;
  const carga = r ? r.cargaFuerza || '' : resumenCargas(fecha, s);
  const ti = tipoInfo(s.tipo);
  const omit = b.estado === 'omitido';

  const segEstado = [['hecho', 'Hecho'], ['parcial', 'Parcial'], ['omitido', 'Omitido']]
    .map(([v, t]) => `<button type="button" data-a="reg-estado" data-v="${v}" aria-pressed="${b.estado === v}">${t}</button>`).join('');
  const segRpe = n => `<div class="seg">${[n, n + 1, n + 2, n + 3, n + 4].map(v => `<button type="button" data-a="reg-rpe" data-v="${v}" aria-pressed="${b.rpe === v}">${v}</button>`).join('')}</div>`;
  const segSens = SENSACIONES.map(([e, t], i) => `<button type="button" data-a="reg-sens" data-v="${i + 1}" aria-pressed="${b.sens === i + 1}" aria-label="${t}">${e}</button>`).join('');
  const zonas = L.ZONAS_DOLOR.map(z => `<button type="button" class="chip-btn" data-a="reg-zona" data-v="${esc(z)}" aria-pressed="${b.zonas.has(z)}">${esc(z)}</button>`).join('');

  abrirHoja(`${cabHoja('Registrar', 'Cancelar', '<button type="button" class="link" data-a="guardar-registro">Guardar</button>')}
  <div class="hoja-tit ${claseTipo(s.tipo)}"><span class="badge">${esc(ti.letra)}</span>
    <span><small>${esc(L.capitalizar(L.fechaLarga(fecha)))}</small><strong>${esc(s.titulo)}</strong></span></div>
  <form id="reg-form" class="reg-form${omit ? ' omitido' : ''}" autocomplete="off" novalidate>
    <div class="campo"><span class="etq">Estado</span><div class="seg tres" data-grupo="estado">${segEstado}</div></div>
    <div class="solo-hecho">
      <div class="campo fila2">
        <div><label for="reg-km">Distancia (km)</label><input id="reg-km" name="km" class="txt" type="text" inputmode="decimal" enterkeyhint="next" placeholder="0,0" value="${esc(km != null ? L.fmtNum(km, 2) : '')}" data-sel></div>
        <div><label for="reg-tiempo">Tiempo</label><input id="reg-tiempo" name="tiempo" class="txt" type="text" inputmode="numeric" pattern="[0-9:]*" enterkeyhint="next" placeholder="mm:ss" value="${esc(tiempo ? L.formatearTiempo(tiempo) : '')}" data-c="tiempo" data-sel></div>
      </div>
      <p class="calc-ritmo" id="reg-ritmo">Ritmo: —</p>
      <div class="campo"><label for="reg-fc">FC media (ppm)</label><input id="reg-fc" name="fc" class="txt" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Opcional" value="${esc(r && r.fcMedia ? r.fcMedia : '')}" data-sel></div>
      <div class="campo"><span class="etq">Esfuerzo (RPE 1-10)</span><div data-grupo="rpe">${segRpe(1)}${segRpe(6)}</div>
        <p class="peq muted mt">1-2 muy fácil · 3-4 fácil · 5-6 moderado · 7-8 duro · 9-10 a tope</p></div>
      <div class="campo"><span class="etq">Sensaciones</span><div class="seg emoji" data-grupo="sens">${segSens}</div></div>
    </div>
    <div class="campo"><span class="etq">Dolor (0-10)</span>
      <div class="rango-fila"><input class="rango" type="range" min="0" max="10" step="1" value="${b.dolor}" data-c="reg-dolor" aria-label="Dolor de 0 a 10"><output class="rango-val" id="reg-dolor-val">${b.dolor}</output></div>
      <div class="chips-sel" id="reg-zonas" ${b.dolor > 0 ? '' : 'hidden'}>${zonas}</div>
    </div>
    ${conFuerza ? `<div class="campo solo-hecho">
      <label class="interruptor"><span>Fuerza hecha</span><input type="checkbox" class="switch" name="fuerza" ${fuerzaHecha ? 'checked' : ''}></label>
      <input name="carga" class="txt" type="text" placeholder="Carga (p. ej. sentadilla 24 kg)" value="${esc(carga)}">
    </div>` : ''}
    ${esTest && porRitmo ? `<div class="campo solo-hecho">
      <label for="reg-ritmo-test">Ritmo medio en los bloques (/km)</label>
      <input id="reg-ritmo-test" name="ritmoTest" class="txt" type="text" inputmode="numeric" pattern="[0-9:]*" placeholder="5:26" value="${esc(res && res.esRitmo ? L.formatearRitmo(res.segundos) : '')}" data-c="ritmo" data-sel>
      <p class="peq muted mt">Se compara con los umbrales de «${esc(b.nombreTest)}».</p>
    </div>` : ''}
    ${esTest && !porRitmo ? `<div class="campo solo-hecho fila2">
      <div><label for="reg-oficial">Tiempo oficial</label><input id="reg-oficial" name="oficial" class="txt" type="text" inputmode="numeric" pattern="[0-9:]*" placeholder="h:mm:ss" value="${esc(res ? L.formatearTiempo(res.segundos) : '')}" data-c="tiempo" data-sel></div>
      <div><label for="reg-dist">Distancia oficial (km)</label><input id="reg-dist" name="dist" class="txt" type="text" inputmode="decimal" value="${esc(distOficial ? L.fmtNum(distOficial, 4) : '')}" data-sel></div>
    </div><p class="calc-ritmo solo-hecho" id="reg-oficial-ritmo"></p>` : ''}
    <div class="campo"><label for="reg-notas">Notas</label><textarea id="reg-notas" name="notas" class="txt" rows="3" placeholder="Cómo fue, clima, zapatillas…">${esc(r ? r.notas || '' : '')}</textarea></div>
    <p class="error" id="reg-error" hidden></p>
    <div class="acciones mt2"><button type="submit" class="btn primario grande">Guardar</button></div>
  </form>`);
  actualizarRitmoRegistro();
}

function resumenCargas(fecha, s) {
  const rut = s && s.fuerza && app.plan.fuerza ? app.plan.fuerza[s.fuerza] : null;
  const fz = app.estado.fuerza[fecha] || {};
  if (!rut || !Array.isArray(rut.ejercicios)) return '';
  return rut.ejercicios
    .map((ej, i) => (fz[i] && fz[i].carga ? `${ej.nombre} ${fz[i].carga}` : ''))
    .filter(Boolean).join(' · ');
}

function actualizarRitmoRegistro() {
  const f = $('#reg-form');
  if (!f) return;
  const el = f.elements;
  const km = L.parseKm(el.km.value);
  const t = L.parseTiempo(el.tiempo.value);
  const out = $('#reg-ritmo');
  if (out) out.innerHTML = km && t ? `Ritmo: <b>${L.formatearRitmo(t / km)}</b> /km` : 'Ritmo: —';
  const o2 = $('#reg-oficial-ritmo');
  if (o2 && el.oficial && el.dist) {
    const d = L.parseKm(el.dist.value);
    const to = L.parseTiempo(el.oficial.value);
    o2.innerHTML = d && to ? `Ritmo oficial: <b>${L.formatearRitmo(to / d)}</b> /km` : '';
  }
}

function errorRegistro(msg) {
  const p = $('#reg-error');
  if (!p) return;
  p.textContent = msg;
  p.hidden = false;
  p.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function guardarRegistro() {
  const b = app.borrador;
  const f = $('#reg-form');
  if (!b || !f) return;
  const el = f.elements;
  const omit = b.estado === 'omitido';
  let km = null;
  let tiempo = null;
  let fc = null;
  if (!omit) {
    const tk = el.km.value.trim();
    const tt = el.tiempo.value.trim();
    const tf = el.fc.value.trim();
    if (tk) {
      km = L.parseKm(tk);
      if (km == null) return errorRegistro('La distancia no es válida (por ejemplo, 5,6).');
    }
    if (tt) {
      tiempo = L.parseTiempo(tt);
      if (tiempo == null) return errorRegistro('El tiempo no es válido: escribe 36:20 o 1:05:12.');
    }
    if (tf) {
      fc = L.parseEntero(tf, 60, 230);
      if (fc == null) return errorRegistro('La FC media debe estar entre 60 y 230.');
    }
  }
  const reg = {
    estado: b.estado,
    km,
    tiempo,
    fcMedia: fc,
    rpe: omit ? null : b.rpe,
    sensaciones: omit ? null : b.sens,
    dolor: b.dolor,
    zonaDolor: b.dolor > 0 ? [...b.zonas] : [],
    fuerzaHecha: !omit && !!(el.fuerza && el.fuerza.checked),
    cargaFuerza: el.carga ? el.carga.value.trim() : '',
    notas: el.notas.value.trim(),
    registrado: ahoraISO(),
  };
  const antes = app.estado;
  const e = L.clonar(antes);
  if (b.esTest && b.porRitmo) {
    const tr = el.ritmoTest ? el.ritmoTest.value.trim() : '';
    if (tr && !omit) {
      const seg = L.parseRitmo(tr);
      if (!seg || seg >= 900) return errorRegistro('El ritmo no es válido (por ejemplo, 5:26).');
      e.tests[b.claveTest] = { segundos: seg, esRitmo: true, distanciaKm: b.distTest, nombre: b.nombreTest, fecha: b.fecha, registrado: reg.registrado };
      reg.ritmoTest = seg;
    } else {
      delete e.tests[b.claveTest];
    }
  } else if (b.esTest) {
    const to = el.oficial ? el.oficial.value.trim() : '';
    if (to && !omit) {
      const seg = L.parseTiempo(to);
      if (seg == null) return errorRegistro('El tiempo oficial no es válido.');
      const dist = L.parseKm(el.dist ? el.dist.value : '');
      if (!(dist > 0)) return errorRegistro('Indica la distancia oficial en km.');
      e.tests[b.claveTest] = { segundos: seg, distanciaKm: dist, nombre: b.nombreTest, fecha: b.fecha, registrado: reg.registrado };
      reg.tiempoOficial = seg;
    } else {
      delete e.tests[b.claveTest];
    }
  }
  e.registros[b.fecha] = reg;
  cerrarHoja();
  setEstado(e, { copia: true });
  toast(omit ? 'Sesión omitida' : 'Registrado', () => setEstado(antes));
}

function hechoTalCual(fecha) {
  const s = app.vista.sesion(fecha);
  if (!s || fecha > app.hoy) return;
  const antes = app.estado;
  const e = L.clonar(antes);
  e.registros[fecha] = {
    estado: 'hecho',
    km: Number(s.kmPlan) > 0 ? Number(s.kmPlan) : null,
    tiempo: Number(s.minPlan) > 0 ? Math.round(Number(s.minPlan) * 60) : null,
    fcMedia: null,
    rpe: null,
    sensaciones: null,
    dolor: null,
    zonaDolor: [],
    fuerzaHecha: !!(s.fuerza || s.tipo === 'fuerza'),
    cargaFuerza: resumenCargas(fecha, s),
    notas: '',
    registrado: ahoraISO(),
    talCual: true,
  };
  if (app.hojaAbierta) cerrarHoja();
  setEstado(e, { copia: true });
  toast('Registrado tal cual', () => setEstado(antes));
}

/* ===================== Pantalla PROGRESO ===================== */

function pantallaProgreso() {
  const st = L.estadisticas(app.idx, app.estado, app.vista, app.hoy);
  const pct = st.cumplimiento == null ? '—' : `${Math.round(st.cumplimiento * 100)} %`;
  return `${bannerPrueba()}
  <header class="cab"><p class="cab-fecha">${esc(textoSemana(app.hoy))}</p><h1>Progreso</h1></header>
  <div class="tiles">
    <div class="tile"><b>${pct}</b><small>Cumplimiento${st.previstas ? ` · ${L.fmtNum(st.cumplidas, 1)} de ${st.previstas}` : ''}</small></div>
    <div class="tile"><b>${st.racha}</b><small>Racha de sesiones cumplidas</small></div>
    <div class="tile"><b>${L.fmtNum(st.kmTotales, 1) || '0'}</b><small>Km registrados</small></div>
    <div class="tile"><b>${st.larga ? `${L.fmtNum(st.larga.km, 1)} km` : '—'}</b><small>Tirada más larga${st.larga ? ` · ${esc(L.fechaCorta(st.larga.fecha))}` : ''}</small></div>
  </div>
  <section class="card">
    <h3>Km por semana</h3>
    ${graficoKm(st.semanas)}
    <div class="leyenda"><span><i style="background:var(--fill2)"></i>Plan</span><span><i style="background:var(--acento)"></i>Real</span></div>
  </section>
  <section class="card">
    <h3>RPE en rodajes fáciles</h3>
    ${graficoRpe(st.rpeFacil, st.tendenciaRpe)}
  </section>
  ${bloquePrediccion()}
  <p class="seccion">Tests y umbrales</p>
  ${listaTests(st)}`;
}

function graficoKm(semanas) {
  if (!semanas.length) return '<p class="muted">Sin semanas en el plan.</p>';
  const W = 340;
  const H = 170;
  const izq = 26;
  const abajo = 18;
  const arriba = 8;
  const max = Math.max(10, ...semanas.map(s => Math.max(s.kmPlan, s.kmHechos)));
  const tope = Math.ceil(max / 10) * 10;
  const ancho = (W - izq) / semanas.length;
  const y = v => r1(arriba + (H - arriba - abajo) * (1 - v / tope));
  let g = '';
  for (let v = 0; v <= tope; v += 10) {
    g += `<line class="g-eje" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="g-txt" x="${izq - 5}" y="${r1(y(v) + 3)}" text-anchor="end">${v}</text>`;
  }
  semanas.forEach((s, i) => {
    const x = izq + i * ancho;
    const bw = Math.max(3, ancho * 0.74);
    const x0 = x + (ancho - bw) / 2;
    if (s.kmPlan > 0) g += `<rect class="g-plan" x="${r1(x0)}" y="${y(s.kmPlan)}" width="${r1(bw)}" height="${r1(y(0) - y(s.kmPlan))}" rx="2"/>`;
    if (s.kmHechos > 0) {
      const bw2 = bw * 0.55;
      g += `<rect class="g-real" x="${r1(x0 + (bw - bw2) / 2)}" y="${y(s.kmHechos)}" width="${r1(bw2)}" height="${r1(y(0) - y(s.kmHechos))}" rx="2"/>`;
    }
    if (semanas.length <= 10 || i % 2 === 0 || s.actual) {
      g += `<text class="g-txt${s.actual ? ' actual' : ''}" x="${r1(x + ancho / 2)}" y="${H - 4}" text-anchor="middle">${esc(s.n)}</text>`;
    }
  });
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kilómetros por semana: plan frente a real">${g}</svg>`;
}

function graficoRpe(lista, tend) {
  const ult = lista.slice(-12);
  if (ult.length < 2) return '<p class="muted mt">Aún hay pocos rodajes fáciles con RPE. Apunta el esfuerzo al registrar y aquí verás la tendencia.</p>';
  const W = 340;
  const H = 96;
  const izq = 22;
  const pad = 8;
  const x = i => r1(izq + pad + (W - izq - 2 * pad) * (i / (ult.length - 1)));
  const y = v => r1(pad + (H - 2 * pad) * (1 - (v - 1) / 9));
  let g = `<rect class="g-banda" x="${izq}" y="${y(4)}" width="${W - izq}" height="${r1(y(2) - y(4))}"/>`;
  for (const v of [1, 5, 10]) g += `<text class="g-txt" x="${izq - 5}" y="${r1(y(v) + 3)}" text-anchor="end">${v}</text>`;
  g += `<polyline class="g-linea" points="${ult.map((p, i) => `${x(i)},${y(p.rpe)}`).join(' ')}"/>`;
  g += ult.map((p, i) => `<circle class="g-punto" cx="${x(i)}" cy="${y(p.rpe)}" r="3"><title>${esc(L.fechaCorta(p.fecha))}: RPE ${esc(p.rpe)}</title></circle>`).join('');
  let txt = '';
  if (tend) {
    const media = L.fmtNum(tend.media, 1);
    if (tend.cambio == null) txt = `Media de los últimos: ${media}.`;
    else if (tend.cambio <= -0.3) txt = `Media ${media}: bajando. Los rodajes te cuestan menos.`;
    else if (tend.cambio >= 0.3) txt = `Media ${media}: subiendo. Ojo con la zona gris.`;
    else txt = `Media ${media}: estable.`;
  }
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="RPE de los últimos rodajes fáciles">${g}</svg>
    <p class="calc-salida">${esc(txt)} La banda verde es el esfuerzo fácil de verdad (RPE 2-4).</p>`;
}

function bloquePrediccion() {
  const t = L.ultimoTest(app.estado);
  const marca = app.plan.marca;
  if (!t) {
    return `<section class="card"><h3>Predicción de la media</h3><p class="muted mt">Aparecerá con el primer test registrado.${marca ? ` Marca a batir: ${esc(marca.tiempo)}.` : ''}</p></section>`;
  }
  const p = L.predecir(t.distanciaKm, t.segundos, L.DIST_MEDIA);
  const objetivos = Array.isArray(app.plan.objetivos) && app.plan.objetivos.length ? app.plan.objetivos : OBJETIVOS_DEFECTO;
  const oR = L.objetivoParaTiempo(p.riegel, objetivos);
  const oV = L.objetivoParaTiempo(p.vdotTiempo, objetivos);
  const fila = (nombre, seg, obj) => `<tr><td>${nombre}</td><td><b>${esc(L.formatearTiempo(seg))}</b><br><span class="muted">${esc(L.formatearRitmo(seg / L.DIST_MEDIA))}/km</span></td><td>${obj ? `<span class="nivel ${esc(obj)}">${esc(obj)}</span>` : '<span class="muted">sobre 2:00</span>'}</td></tr>`;
  return `<section class="card">
    <h3>Predicción de la media</h3>
    <p class="muted peq">Desde «${esc(t.nombre || 'test')}»: ${esc(L.formatearTiempo(t.segundos))} en ${esc(L.fmtNum(t.distanciaKm, 2))} km (${esc(L.fechaCorta(t.fecha || t.clave))}).</p>
    <table class="tabla mt"><tr><th>Método</th><th>Media</th><th>Objetivo</th></tr>
      ${fila('Riegel (1,06)', p.riegel, oR)}
      ${fila(`VDOT ${L.fmtNum(p.vdot, 1)}`, p.vdotTiempo, oV)}
    </table>
    <p class="calc-salida">Son estimaciones. Con poco volumen o tiradas cortas, la media real suele salir un 1-2 % más lenta. Manda el último test.${marca ? ` Marca a batir: ${esc(marca.tiempo)}.` : ''}</p>
  </section>`;
}

function listaTests(st) {
  const tests = (Array.isArray(app.plan.tests) ? app.plan.tests : []).filter(t => t && t.fecha).slice()
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const enPlan = new Set(tests.map(t => t.fecha));
  const filas = tests.map(t => {
    const res = app.estado.tests[t.fecha];
    const cl = res ? L.clasificarTest(res.segundos, t.segundos) : null;
    let nota = '';
    if (res && !res.esRitmo && Number(t.distanciaKm) >= 10) {
      const previas = st.semanas.filter(s => s.inicio < L.lunesDe(t.fecha)).slice(-6);
      const media = previas.length ? previas.reduce((a, s) => a + s.kmHechos, 0) / previas.length : null;
      if (media != null && media < 33) nota = `Volumen medio ${L.fmtNum(media, 1)} km/sem (<33): a este test se le piden 30 s más para confirmar la misma vía.`;
    }
    return `<div class="li t-test"><span class="badge">T</span>
      <span class="li-cuerpo"><small>${esc(L.fechaCorta(t.fecha))}${t.semana != null ? ` · S${esc(t.semana)}` : ''}</small><b>${esc(t.nombre || 'Test')}</b>
        <em>${res ? `${esc(textoResultado(res))} · ${esc(L.fmtNum(res.distanciaKm, 2))} km` : `Pendiente${t.umbrales && t.umbrales.B ? ` · B ${esc(t.umbrales.B)}` : ''}${t.umbrales && t.umbrales.A ? ` · A ${esc(t.umbrales.A)}` : ''}`}</em>
        ${nota ? `<em>${esc(nota)}</em>` : ''}</span>
      <span class="li-der">${chipNivel(cl)}</span></div>`;
  });
  for (const [clave, res] of Object.entries(app.estado.tests)) {
    if (enPlan.has(clave) || !res) continue;
    filas.push(`<div class="li t-carrera"><span class="badge">21</span>
      <span class="li-cuerpo"><small>${esc(L.fechaCorta(res.fecha || clave))}</small><b>${esc(res.nombre || 'Resultado')}</b>
      <em>${esc(textoResultado(res))} · ${esc(L.fmtNum(res.distanciaKm, 2))} km</em></span><span class="li-der"></span></div>`);
  }
  if (!filas.length) return '<section class="card"><p class="muted">El plan no tiene tests.</p></section>';
  return `<div class="lista">${filas.join('')}</div>`;
}

/* ===================== Pantalla MÁS ===================== */

function pantallaMas() {
  const p = app.plan;
  return `${bannerPrueba()}
  <header class="cab"><h1>Más</h1></header>
  ${p ? seccionObjetivos(p) : ''}
  ${p ? seccionZonas(p) : ''}
  ${p ? seccionRitmos(p) : ''}
  ${seccionCalculadora()}
  ${p ? seccionCarrera(p) : ''}
  ${seccionReglas(p)}
  ${seccionHistorial()}
  ${seccionDatos()}
  <p class="peq muted mt2" style="text-align:center">Plan 21K v${esc(L.APP_VERSION)}${p && p.actualizado ? ` · plan del ${esc(p.actualizado)}` : ''}${p && p.muestra ? ' · plan de MUESTRA' : ''}<br>${'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'Lista para usar sin conexión' : 'Sin modo sin conexión todavía (ábrela desde el icono)'}</p>`;
}

function seccionObjetivos(p) {
  const objs = Array.isArray(p.objetivos) ? p.objetivos : [];
  if (!objs.length && !p.marca) return '';
  const filas = objs.map(o => `<div class="obj"><span class="letra">${esc(o.id)}</span>
    <span><b>${esc(o.nombre || '')}: ${esc(o.tiempo || '')}</b><em>${o.ritmo ? `${esc(o.ritmo)}/km · ` : ''}${esc(o.descripcion || '')}</em></span>
    <span class="prob">${esc(o.probabilidad || '')}</span></div>`).join('');
  return `<p class="seccion">Objetivos</p><section class="card">
    ${p.marca ? `<p class="muted peq">Marca a batir: <b>${esc(p.marca.tiempo)}</b>${p.marca.fecha ? ` (${esc(L.fechaCorta(p.marca.fecha))} ${esc(String(p.marca.fecha).slice(0, 4))})` : ''}${p.marca.ritmo ? ` · ${esc(p.marca.ritmo)}/km` : ''}</p>` : ''}
    <div class="mt">${filas}</div></section>`;
}

function seccionZonas(p) {
  const z = Array.isArray(p.zonasFC) ? p.zonasFC : [];
  if (!z.length) return '';
  const fc = Number(p.fcMax) || null;
  const rango = x => (Number(x.min) <= 0 ? `< ${Number(x.max) + 1}` : fc && Number(x.max) >= fc ? `≥ ${x.min}` : `${x.min}-${x.max}`);
  return `<p class="seccion">Zonas de FC${fc ? ` · máx. ${fc}` : ''}</p><section class="card">
    <table class="tabla"><colgroup><col style="width:28%"><col style="width:24%"><col></colgroup>
    <tr><th>Zona</th><th>ppm</th><th>Uso</th></tr>
    ${z.map(x => `<tr><td>${esc(x.id)} ${esc(x.nombre || '')}</td><td>${esc(rango(x))}</td><td>${esc(x.uso || '')}</td></tr>`).join('')}
    </table></section>`;
}

function seccionRitmos(p) {
  const t = L.ritmosVigentes(p, app.hoy);
  if (!t) return '';
  const tabla = tramo => `<table class="tabla"><colgroup><col style="width:34%"><col style="width:36%"><col></colgroup>
    <tr><th>Tipo</th><th>Ritmo</th><th>FC</th></tr>
    ${(Array.isArray(tramo.tabla) ? tramo.tabla : []).map(f => `<tr><td>${esc(f.tipo)}</td><td>${esc(f.ritmo)}</td><td>${esc(f.fc || '')}</td></tr>`).join('')}</table>`;
  const otros = (Array.isArray(p.ritmos) ? p.ritmos : []).filter(x => x && x !== t);
  return `<p class="seccion">Ritmos vigentes</p><section class="card">
    <h3>${esc(t.nombre || 'Ritmos')}</h3>
    <p class="muted peq">${t.desde ? `Del ${esc(L.fechaCorta(t.desde))}` : ''}${t.hasta ? ` al ${esc(L.fechaCorta(t.hasta))}` : ''}</p>
    <div class="mt">${tabla(t)}</div>
    ${otros.map(o => `<details class="bloques"><summary>${esc(o.nombre || o.id || 'Otro tramo')}</summary>${tabla(o)}</details>`).join('')}
  </section>`;
}

function seccionCalculadora() {
  const dist = [['5', '5K'], ['10', '10K'], ['21.0975', 'Media'], ['42.195', 'Maratón']];
  return `<p class="seccion">Calculadora</p>
  <section class="card">
    <h3>Ritmo ↔ tiempo</h3>
    <div class="chips-sel">${dist.map(([v, t]) => `<button type="button" class="chip-btn" data-a="calc-dist" data-v="${v}">${t}</button>`).join('')}</div>
    <div class="campo"><label for="calc-km">Distancia (km)</label><input id="calc-km" class="txt" type="text" inputmode="decimal" value="21,0975" data-calc="km" data-sel></div>
    <div class="campo fila2">
      <div><label for="calc-ritmo">Ritmo (/km)</label><input id="calc-ritmo" class="txt" type="text" inputmode="numeric" placeholder="5:26" data-calc="ritmo" data-sel></div>
      <div><label for="calc-tiempo">Tiempo</label><input id="calc-tiempo" class="txt" type="text" inputmode="numeric" placeholder="1:54:40" data-calc="tiempo" data-sel></div>
    </div>
    <p class="calc-salida" id="calc-salida">Escribe un ritmo o un tiempo (con el teclado numérico: 526 = 5:26).</p>
  </section>
  <section class="card">
    <h3>Predictor</h3>
    <div class="campo fila2">
      <div><label for="pred-km">Marca: distancia (km)</label><input id="pred-km" class="txt" type="text" inputmode="decimal" value="10" data-calc="pred" data-sel></div>
      <div><label for="pred-tiempo">Tiempo</label><input id="pred-tiempo" class="txt" type="text" inputmode="numeric" placeholder="52:10" data-calc="pred-t" data-sel></div>
    </div>
    <div class="calc-salida" id="pred-salida">Riegel (1,06) y VDOT de Daniels para 5K, 10K, media y maratón.</div>
  </section>`;
}

function seccionCarrera(p) {
  const c = p.carrera;
  const tests = (Array.isArray(p.tests) ? p.tests : []).filter(Boolean).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const filas = tests.map(t => {
    const url = urlSegura(t.url);
    return `<div class="li t-test"><span class="badge">T</span><span class="li-cuerpo"><small>${esc(L.fechaCorta(t.fecha))}${t.hora ? ` · ${esc(t.hora)}` : ''}</small>
      <b>${esc(t.nombre || 'Test')}</b><em>${esc([t.distancia, t.lugar, t.inscripcion].filter(Boolean).join(' · '))}</em>
      ${url ? `<em><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Inscripción ↗</a></em>` : ''}</span><span class="li-der"></span></div>`;
  }).join('');
  return `<p class="seccion">Carrera y tests</p>${c ? tarjetaCarrera(c) : ''}${filas ? `<div class="lista">${filas}</div>` : ''}`;
}

function seccionReglas(p) {
  const propias = p && Array.isArray(p.reglas) ? p.reglas : [];
  return `<p class="seccion">Reglas de ajuste</p><section class="card">
    <p class="muted peq">La app propone; tú aceptas o rechazas. Si aceptas, cambia lo que se ve ese día.</p>
    <ol class="reglas">
      <li><b>Sesión clave de ayer sin hacer:</b> se recoloca esta semana si quedan 48 h hasta la siguiente sesión dura; si no, se pierde. Prioridad: larga > calidad 1 > fuerza A > calidad 2.</li>
      <li><b>Dolor de 3/10 o más</b> (check-in o registro): hoy descanso o rodaje muy suave. Si dura 2-3 días o llega a 5/10: parar y consultar.</li>
      <li><b>Check-in malo en día de calidad</b> (sueño ≤2 y energía ≤2, o piernas ≤2): fácil de 30-40'.</li>
      <li><b>RPE de 8 o más en dos rodajes fáciles</b> de la semana: aviso de zona gris.</li>
      <li><b>6 días o más sin registrar:</b> aviso de vuelta gradual (50 % y luego 75 %).</li>
    </ol>
    ${propias.length ? `<p class="eyebrow mt2">Del plan</p><ul class="reglas">${propias.map(r => `<li><b>${esc(r.titulo || '')}:</b> ${esc(r.texto || '')}</li>`).join('')}</ul>` : ''}
    <p class="muted peq mt">Son reglas orientativas: no sustituyen a un fisio ni a un médico.</p>
  </section>`;
}

function seccionHistorial() {
  const lista = Object.values(app.estado.ajustes).filter(a => a && a.id)
    .sort((a, b) => (String(a.en || '') < String(b.en || '') ? 1 : -1)).slice(0, 12);
  if (!lista.length) return '';
  const dec = { aceptado: 'Aceptado', rechazado: 'Rechazado', visto: 'Visto', perdida: 'Se pierde' };
  return `<p class="seccion">Ajustes recientes</p><div class="lista">${lista.map(a => `<div class="li"><span class="badge t-descanso" style="background:var(--fill)">${a.decision === 'aceptado' ? '✓' : a.decision === 'rechazado' ? '✕' : '·'}</span>
    <span class="li-cuerpo"><small>${esc(L.fechaCorta(a.fecha))} · ${esc(dec[a.decision] || a.decision)}</small><b>${esc(a.titulo || a.regla)}</b></span>
    <span class="li-der">${a.decision === 'aceptado' ? `<button type="button" class="link" data-a="deshacer-ajuste" data-id="${esc(a.id)}">Deshacer</button>` : ''}</span></div>`).join('')}</div>`;
}

function seccionDatos() {
  const n = Object.keys(app.estado.registros).length;
  const c = Object.keys(app.estado.checkins).length;
  const persist = app.persistente == null ? 'no se sabe' : app.persistente ? 'sí' : 'no (normal hasta abrirla desde el icono)';
  return `<p class="seccion" id="datos">Datos</p><section class="card">
    <div class="interruptor"><span>Última copia en el PC</span><span class="muted peq" id="estado-copia">${esc(app.modoPrueba ? 'modo prueba' : textoCopia())}</span></div>
    <p class="muted peq">Se hace sola al abrir la app y al registrar si la última tiene más de 12 h, cuando estás en la wifi de casa con el servidor del PC abierto.</p>
    <div class="acciones">
      <button type="button" class="btn primario" data-a="copiar-ahora" ${app.modoPrueba ? 'disabled' : ''}>Copiar al PC ahora</button>
      <div class="acciones dos" style="margin-top:0">
        <button type="button" class="btn" data-a="exportar">Exportar JSON</button>
        <button type="button" class="btn" data-a="importar">Importar JSON</button>
      </div>
      <button type="button" class="btn peligro" data-a="borrar-todo">Borrar todo</button>
    </div>
    <input type="file" id="importar" accept="application/json,.json" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" tabindex="-1" aria-hidden="true">
    <p class="muted peq mt">${plural(n, 'registro', 'registros')} · ${plural(c, 'check-in', 'check-ins')} · datos protegidos contra borrado: ${esc(persist)}.</p>
  </section>`;
}

/* ===================== Calculadora ===================== */

function onCalc(el) {
  const k = el.dataset.calc;
  if (k === 'ritmo') el.value = L.autoformatoRitmo(el.value);
  if (k === 'tiempo' || k === 'pred-t') el.value = L.autoformatoTiempo(el.value);
  if (k === 'pred' || k === 'pred-t') {
    calcularPrediccion();
    return;
  }
  if (k === 'ritmo') app.calcBase = 'ritmo';
  if (k === 'tiempo') app.calcBase = 'tiempo';
  calcularRitmoTiempo();
}

function calcularRitmoTiempo() {
  const kmEl = $('#calc-km');
  const rEl = $('#calc-ritmo');
  const tEl = $('#calc-tiempo');
  const out = $('#calc-salida');
  if (!kmEl || !rEl || !tEl || !out) return;
  const km = L.parseKm(kmEl.value);
  if (!(km > 0)) {
    out.textContent = 'Indica la distancia en km.';
    return;
  }
  let ritmo = L.parseRitmo(rEl.value);
  let tiempo = L.parseTiempo(tEl.value);
  if (app.calcBase === 'ritmo' && ritmo) {
    tiempo = ritmo * km;
    tEl.value = L.formatearTiempo(tiempo);
  } else if (app.calcBase === 'tiempo' && tiempo) {
    ritmo = tiempo / km;
    rEl.value = L.formatearRitmo(ritmo);
  }
  if (!ritmo || !tiempo) {
    out.textContent = 'Escribe un ritmo o un tiempo.';
    return;
  }
  const kmh = 3600 / ritmo;
  const pasos = [];
  for (let d = 5; d < km; d += 5) pasos.push(`${d} km ${L.formatearTiempo(ritmo * d)}`);
  out.innerHTML = `<b>${esc(L.formatearTiempo(tiempo))}</b> a <b>${esc(L.formatearRitmo(ritmo))}/km</b> (${esc(L.fmtNum(kmh, 1))} km/h)${pasos.length ? `<br>Pasos: ${esc(pasos.join(' · '))}` : ''}`;
}

function calcularPrediccion() {
  const out = $('#pred-salida');
  if (!out) return;
  const km = L.parseKm($('#pred-km').value);
  const t = L.parseTiempo($('#pred-tiempo').value);
  if (!(km > 0) || !t) {
    out.textContent = 'Riegel (1,06) y VDOT de Daniels para 5K, 10K, media y maratón.';
    return;
  }
  const v = L.vdot(km, t);
  const dist = [[5, '5K'], [10, '10K'], [L.DIST_MEDIA, 'Media'], [42.195, 'Maratón']];
  const objetivos = app.plan && Array.isArray(app.plan.objetivos) && app.plan.objetivos.length ? app.plan.objetivos : OBJETIVOS_DEFECTO;
  const media = L.tiempoParaVdot(v, L.DIST_MEDIA);
  const obj = L.objetivoParaTiempo(media, objetivos);
  out.innerHTML = `<table class="tabla mt"><tr><th>Distancia</th><th>Riegel</th><th>VDOT</th></tr>
    ${dist.map(([d, n]) => `<tr><td>${n}</td><td>${esc(L.formatearTiempo(L.riegel(t, km, d)))}</td><td>${esc(L.formatearTiempo(L.tiempoParaVdot(v, d)))}</td></tr>`).join('')}
    </table><p class="mt">VDOT <b>${esc(L.fmtNum(v, 1))}</b>${obj ? ` · en la media apunta al objetivo <b>${esc(obj)}</b>` : ' · en la media, por encima de 2:00'}. La maratón por Riegel suele salir optimista.</p>`;
}

/* ===================== Datos: exportar, importar, borrar ===================== */

async function exportar() {
  const datos = JSON.stringify(L.paqueteCopia(app.estado, { plan: app.plan }), null, 1);
  const nombre = `plan21k-${app.hoy}.json`;
  try {
    const fichero = new File([datos], nombre, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [fichero] })) {
      await navigator.share({ files: [fichero], title: 'Copia de Plan 21K' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    const url = URL.createObjectURL(new Blob([datos], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch (e) {
    toast('No se ha podido exportar');
  }
}

function importarFichero(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const lector = new FileReader();
  lector.onload = () => {
    let json = null;
    try { json = JSON.parse(String(lector.result)); } catch (e) { json = null; }
    const nuevo = L.estadoDesdeImportacion(json);
    if (!nuevo) {
      toast('El fichero no parece una copia de Plan 21K');
      return;
    }
    const n = Object.keys(nuevo.registros).length;
    if (!window.confirm(`Se sustituirán tus datos actuales por los del fichero (${plural(n, 'registro', 'registros')}). ¿Seguir?`)) return;
    const antes = app.estado;
    setEstado(nuevo);
    toast('Datos importados', () => setEstado(antes));
  };
  lector.onerror = () => toast('No se ha podido leer el fichero');
  lector.readAsText(f);
  input.value = '';
}

async function borrarTodo() {
  if (!window.confirm('¿Borrar TODOS tus registros, check-ins y ajustes de este iPhone?')) return;
  if (!window.confirm('Segunda confirmación: no se puede deshacer salvo con una copia. ¿Borrar todo?')) return;
  await copiaAlPC(true); // último intento de copia, en silencio
  borrarLS(app.claveEstado);
  setEstado(L.estadoVacio());
  toast('Datos borrados');
}

/* ===================== Eventos ===================== */

function toggleValor(el, campo) {
  const b = app.borrador;
  if (!b) return;
  const v = Number(el.dataset.v);
  const grupo = el.closest('[data-grupo]');
  if (b[campo] === v) {
    b[campo] = null;
    el.setAttribute('aria-pressed', 'false');
    return;
  }
  b[campo] = v;
  if (grupo) grupo.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === el)));
}

function guardarCheckin(campo, valor) {
  const e = L.clonar(app.estado);
  const c = { ...(e.checkins[app.hoy] || {}) };
  c[campo] = valor;
  c.registrado = ahoraISO();
  e.checkins[app.hoy] = c;
  setEstado(e);
}

function guardarEjercicio(el) {
  const fecha = el.dataset.fecha;
  const i = el.dataset.i;
  const e = L.clonar(app.estado);
  const fz = { ...(e.fuerza[fecha] || {}) };
  const est = { ...(fz[i] || {}) };
  if (el.dataset.c === 'ej') {
    est.hecho = el.checked;
  } else {
    est.carga = el.value.trim();
    if (est.carga) e.cargas[el.dataset.nombre] = est.carga;
  }
  fz[i] = est;
  e.fuerza[fecha] = fz;
  app.estado = L.normalizarEstado(e);
  app.sucio = true; // la tarjeta de Hoy se repinta al cerrar la hoja
  guardar();
}

const ACC = {
  tab: el => cambiarTab(el.dataset.tab),
  hecho: el => hechoTalCual(el.dataset.fecha),
  registrar: el => abrirRegistro(el.dataset.fecha),
  detalle: el => abrirDetalle(el.dataset.fecha, el.dataset.ir),
  'cerrar-hoja': () => cerrarHoja(),
  'ck-toggle': () => {
    const abierto = app.checkinAbierto ?? !checkinCompleto(app.estado.checkins[app.hoy]);
    app.checkinAbierto = !abierto;
    render();
  },
  ck: el => guardarCheckin(el.dataset.k, Number(el.dataset.v)),
  prop: el => {
    const p = app.propuestas.find(x => x.id === el.dataset.id);
    if (!p) return;
    const op = el.dataset.op;
    const antes = app.estado;
    setEstado(L.aplicarPropuesta(antes, p, op, app.idx, ahoraISO()));
    const msg = op === 'rechazar' ? 'Propuesta descartada' : op === 'visto' ? 'Anotado' : 'Ajuste aplicado';
    toast(msg, () => setEstado(antes));
  },
  'deshacer-ajuste': el => {
    const antes = app.estado;
    if (app.hojaAbierta) cerrarHoja();
    setEstado(L.deshacerAjuste(antes, el.dataset.id, app.idx));
    toast('Ajuste deshecho', () => setEstado(antes));
  },
  'sem-prev': () => {
    app.lunesSemana = L.sumarDias(app.lunesSemana || L.lunesDe(app.hoy), -7);
    render();
  },
  'sem-next': () => {
    app.lunesSemana = L.sumarDias(app.lunesSemana || L.lunesDe(app.hoy), 7);
    render();
  },
  'sem-hoy': () => {
    app.lunesSemana = L.lunesDe(app.hoy);
    render();
  },
  'mover-abrir': el => {
    const hoja = $('#hoja');
    const arriba = hoja.scrollTop;
    hoja.innerHTML = htmlDetalle(el.dataset.fecha, true);
    hoja.scrollTop = arriba;
    const panel = $('#mover-panel');
    if (panel) setTimeout(() => panel.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  },
  'mover-a': el => {
    const { desde, hasta } = el.dataset;
    if (el.dataset.aviso === '1' && !window.confirm('Quedarían dos días duros seguidos. ¿Mover igualmente?')) return;
    const antes = app.estado;
    const { estado } = L.moverSesion(antes, app.idx, desde, hasta, app.hoy, ahoraISO());
    cerrarHoja();
    setEstado(estado);
    toast(`Movida al ${L.fechaCorta(hasta)}`, () => setEstado(antes));
  },
  omitir: el => {
    const f = el.dataset.fecha;
    const antes = app.estado;
    const e = L.clonar(antes);
    e.registros[f] = {
      estado: 'omitido', km: null, tiempo: null, fcMedia: null, rpe: null, sensaciones: null,
      dolor: null, zonaDolor: [], fuerzaHecha: false, cargaFuerza: '', notas: '', registrado: ahoraISO(),
    };
    cerrarHoja();
    setEstado(e, { copia: true });
    toast('Sesión omitida', () => setEstado(antes));
  },
  'borrar-registro': el => {
    if (!window.confirm('¿Borrar el registro de este día?')) return;
    const f = el.dataset.fecha;
    const antes = app.estado;
    const e = L.clonar(antes);
    delete e.registros[f];
    cerrarHoja();
    setEstado(e);
    toast('Registro borrado', () => setEstado(antes));
  },
  'reg-estado': el => {
    if (!app.borrador) return;
    app.borrador.estado = el.dataset.v;
    el.closest('[data-grupo]').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === el)));
    const f = $('#reg-form');
    if (f) f.classList.toggle('omitido', el.dataset.v === 'omitido');
  },
  'reg-rpe': el => toggleValor(el, 'rpe'),
  'reg-sens': el => toggleValor(el, 'sens'),
  'reg-zona': el => {
    const b = app.borrador;
    if (!b) return;
    const z = el.dataset.v;
    if (b.zonas.has(z)) b.zonas.delete(z);
    else b.zonas.add(z);
    el.setAttribute('aria-pressed', String(b.zonas.has(z)));
  },
  'guardar-registro': () => guardarRegistro(),
  'toast-deshacer': () => {
    const fn = app.toastDeshacer;
    ocultarToast();
    if (fn) fn();
  },
  'copiar-ahora': async el => {
    el.disabled = true;
    el.textContent = 'Copiando…';
    const r = await copiaAlPC(true);
    if (app.tab === 'mas') render();
    if (r == null) toast('Ya hay una copia en marcha');
    else if (r.ok) toast(`Copia guardada en el PC${r.fichero ? ` (${r.fichero})` : ''}`);
    else toast('No se ha podido copiar. ¿Estás en la wifi de casa con el servidor del PC abierto?');
  },
  exportar: () => exportar(),
  importar: () => { const i = $('#importar'); if (i) i.click(); },
  'borrar-todo': () => borrarTodo(),
  'ir-datos': () => {
    cambiarTab('mas');
    const d = $('#datos');
    if (d) d.scrollIntoView({ block: 'start' });
  },
  'calc-dist': el => {
    const km = $('#calc-km');
    if (!km) return;
    km.value = L.fmtNum(Number(el.dataset.v), 4);
    calcularRitmoTiempo();
  },
};

function onClick(ev) {
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = ACC[el.dataset.a];
  if (!fn) return;
  ev.preventDefault();
  fn(el, ev);
}

function onInput(ev) {
  const el = ev.target;
  if (!el || !el.dataset) return;
  const c = el.dataset.c;
  if (c === 'ck-dolor') {
    const o = $('#ck-dolor-val');
    if (o) o.textContent = el.value;
    el.classList.remove('sin-valor');
    return;
  }
  if (c === 'reg-dolor') {
    const v = Number(el.value);
    if (app.borrador) app.borrador.dolor = v;
    const o = $('#reg-dolor-val');
    if (o) o.textContent = String(v);
    const z = $('#reg-zonas');
    if (z) z.hidden = v === 0;
    return;
  }
  if (c === 'tiempo') {
    el.value = L.autoformatoTiempo(el.value);
    actualizarRitmoRegistro();
    return;
  }
  if (c === 'ritmo') {
    el.value = L.autoformatoRitmo(el.value);
    return;
  }
  if (el.form && el.form.id === 'reg-form' && (el.name === 'km' || el.name === 'dist')) {
    actualizarRitmoRegistro();
    return;
  }
  if (el.dataset.calc) onCalc(el);
}

function onChange(ev) {
  const el = ev.target;
  if (!el) return;
  if (el.id === 'importar') {
    importarFichero(el);
    return;
  }
  const c = el.dataset ? el.dataset.c : null;
  if (c === 'ej' || c === 'ej-carga') guardarEjercicio(el);
  else if (c === 'ck-dolor') guardarCheckin('dolor', Number(el.value));
}

function onFocus(ev) {
  const el = ev.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el.hasAttribute('data-sel')) setTimeout(() => { try { el.select(); } catch (e) { /* nada */ } }, 30);
  if (el.closest('#hoja')) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
}

function configurarEventos() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('focusin', onFocus);
  document.addEventListener('submit', ev => {
    ev.preventDefault();
    if (ev.target && ev.target.id === 'reg-form') guardarRegistro();
  });
  document.addEventListener('toggle', ev => {
    const t = ev.target;
    if (t && t.matches && t.matches('#vista details.bloques')) app.bloquesAbiertos = t.open;
  }, true);
  $('#hoja-fondo').addEventListener('click', ev => {
    if (ev.target && ev.target.id === 'hoja-fondo') cerrarHoja();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && app.hojaAbierta) cerrarHoja();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') alVolver();
  });
  window.addEventListener('pageshow', ev => {
    if (ev.persisted) alVolver();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ajustarViewport);
    window.visualViewport.addEventListener('scroll', ajustarViewport);
  }
}

iniciar();
