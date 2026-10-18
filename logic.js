/* Plan 21K · logic.js
 * Lógica pura, sin DOM ni almacenamiento: fechas, tiempos y ritmos, predicción
 * (Riegel y VDOT), avisos de nutrición, calendario efectivo (movimientos y
 * ajustes), reglas de ajuste y estadísticas. Todo se prueba en dev/test.html.
 *
 * Fechas: siempre texto local AAAA-MM-DD. Nunca toISOString() para "el día".
 * Las operaciones con días usan las 12:00 locales, así el cambio de hora
 * (25-oct-2026, 28-mar-2027) no mueve ninguna fecha.
 */

export const APP_VERSION = '1.1.0';
export const CLAVE_ESTADO = 'plan21k.v1';
export const DIST_MEDIA = 21.0975;
export const ZONAS_DOLOR = ['gemelo', 'sóleo', 'Aquiles', 'rodilla', 'cintilla', 'fascia', 'cadera', 'espalda', 'otro'];

/* ===================== Fechas ===================== */

const pad2 = n => String(n).padStart(2, '0');

export const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const DIAS_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const DIAS_LETRA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fecha local AAAA-MM-DD de un Date (sin pasar por UTC). */
export function fechaISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function hoyISO(ahora = new Date()) {
  return fechaISO(ahora);
}

/** AAAA-MM-DD -> Date a las 12:00 locales, o null si no es una fecha real. */
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const a = Number(m[1]);
  const me = Number(m[2]) - 1;
  const d = Number(m[3]);
  const f = new Date(a, me, d, 12, 0, 0, 0);
  if (f.getFullYear() !== a || f.getMonth() !== me || f.getDate() !== d) return null;
  return f;
}

export function esFechaISO(s) {
  return parseISO(s) !== null;
}

export function sumarDias(iso, n) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return fechaISO(d);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function difDias(desde, hasta) {
  const a = parseISO(desde);
  const b = parseISO(hasta);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** 0 = lunes … 6 = domingo; -1 si la fecha no es válida. */
export function diaSemana(iso) {
  const d = parseISO(iso);
  return d ? (d.getDay() + 6) % 7 : -1;
}

export function lunesDe(iso) {
  const n = diaSemana(iso);
  return n < 0 ? null : sumarDias(iso, -n);
}

export function fechasEntre(desde, hasta) {
  const out = [];
  if (!esFechaISO(desde) || !esFechaISO(hasta)) return out;
  for (let f = desde, i = 0; f <= hasta && i < 2000; f = sumarDias(f, 1), i++) out.push(f);
  return out;
}

export function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** "jueves 15 de octubre" */
export function fechaLarga(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${DIAS_LARGO[diaSemana(iso)]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** "jue 15 oct" */
export function fechaCorta(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${DIAS_CORTO[diaSemana(iso)]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

/** "19-25 oct" o "26 oct - 1 nov" */
export function rangoSemanaTexto(lunes) {
  const a = parseISO(lunes);
  const b = parseISO(sumarDias(lunes, 6));
  if (!a || !b) return '';
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}-${b.getDate()} ${MESES_CORTO[b.getMonth()]}`;
  return `${a.getDate()} ${MESES_CORTO[a.getMonth()]} - ${b.getDate()} ${MESES_CORTO[b.getMonth()]}`;
}

/** Cuenta atrás a la carrera. */
export function cuentaAtras(hoy, fechaCarrera) {
  const dias = difDias(hoy, fechaCarrera);
  if (!isFinite(dias)) return null;
  return { dias, semanas: Math.floor(Math.max(dias, 0) / 7), resto: Math.max(dias, 0) % 7 };
}

/* ===================== Números, tiempos y ritmos ===================== */

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

/** Número con coma decimal y sin ceros de sobra: 5.65 -> "5,65", 5 -> "5". */
export function fmtNum(n, dec = 2) {
  if (n == null || !isFinite(n)) return '';
  const f = 10 ** dec;
  return String(Math.round(n * f) / f).replace('.', ',');
}

export function redondearMedio(x) {
  return Math.round(x * 2) / 2;
}

/** "5,65" o "5.65" -> 5.65; null si no es válido. */
export function parseKm(txt) {
  const s = String(txt ?? '').trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) && n < 1000 ? n : null;
}

export function parseEntero(txt, min = -Infinity, max = Infinity) {
  const s = String(txt ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/**
 * Tiempo en segundos desde "mm:ss", "h:mm:ss", "36,20" o solo cifras
 * (el teclado numérico del iPhone no tiene ":"): "45" = 45 min,
 * "3620" = 36:20, "10512" = 1:05:12. null si no es válido o es 0.
 */
export function parseTiempo(txt) {
  if (txt == null) return null;
  const s = String(txt).trim()
    .replace(/[.,'’"″\s]+/g, ':')
    .replace(/:+/g, ':')
    .replace(/^:|:$/g, '');
  if (!s) return null;
  let h = 0;
  let m = 0;
  let sec = 0;
  if (s.includes(':')) {
    const p = s.split(':');
    if (p.length > 3 || p.some(x => !/^\d+$/.test(x))) return null;
    const n = p.map(Number);
    if (n.length === 2) {
      m = n[0];
      sec = n[1];
      if (sec > 59) return null;
    } else {
      h = n[0];
      m = n[1];
      sec = n[2];
      if (m > 59 || sec > 59) return null;
    }
  } else {
    if (!/^\d{1,6}$/.test(s)) return null;
    if (s.length <= 2) {
      m = Number(s);
    } else if (s.length <= 4) {
      m = Number(s.slice(0, -2));
      sec = Number(s.slice(-2));
    } else {
      h = Number(s.slice(0, -4));
      m = Number(s.slice(-4, -2));
      sec = Number(s.slice(-2));
    }
    if (sec > 59 || (h > 0 && m > 59)) return null;
  }
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

/** 3912 -> "1:05:12"; 2180 -> "36:20". */
export function formatearTiempo(seg) {
  if (seg == null || !isFinite(seg) || seg < 0) return '';
  const t = Math.round(seg);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** Formatea mientras se escribe con el teclado numérico: "3620" -> "36:20". */
export function autoformatoTiempo(txt) {
  const d = String(txt ?? '').replace(/\D/g, '').slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** Igual que autoformatoTiempo pero para ritmos m:ss (máx. 4 cifras). */
export function autoformatoRitmo(txt) {
  const d = String(txt ?? '').replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, -2)}:${d.slice(-2)}`;
}

/** 318 -> "5:18" */
export function formatearRitmo(segKm) {
  if (!(segKm > 0) || !isFinite(segKm)) return '';
  const t = Math.round(segKm);
  return `${Math.floor(t / 60)}:${pad2(t % 60)}`;
}

export function parseRitmo(txt) {
  return parseTiempo(txt);
}

export function ritmoDe(km, seg) {
  return km > 0 && seg > 0 ? seg / km : null;
}

/** Media de los ritmos m:ss que aparezcan en un texto ("6:45-7:20" -> 422,5 s). */
export function ritmoMedioDeTexto(txt) {
  const m = String(txt ?? '').match(/\d{1,2}:\d{2}/g);
  if (!m) return null;
  const v = m.map(parseTiempo).filter(x => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/* ===================== Predicción: Riegel y VDOT ===================== */

/** Riegel: T2 = T1 · (D2/D1)^exp */
export function riegel(seg1, d1, d2, exp = 1.06) {
  if (!(seg1 > 0 && d1 > 0 && d2 > 0)) return null;
  return seg1 * Math.pow(d2 / d1, exp);
}

// Fórmulas públicas de Daniels y Gilbert (Oxygen Power, 1979).
function costeVO2(vMetrosMin) {
  return -4.60 + 0.182258 * vMetrosMin + 0.000104 * vMetrosMin * vMetrosMin;
}
function fraccionVO2max(tMin) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

/** VDOT de una marca (distancia en km, tiempo en s). */
export function vdot(distKm, seg) {
  if (!(distKm > 0 && seg > 0)) return null;
  const t = seg / 60;
  const v = (distKm * 1000) / t;
  return costeVO2(v) / fraccionVO2max(t);
}

/** Tiempo (s) que corresponde a un VDOT en una distancia (bisección). */
export function tiempoParaVdot(vd, distKm) {
  if (!(vd > 0 && distKm > 0)) return null;
  let lo = distKm * 100; // 1:40/km
  let hi = distKm * 1200; // 20:00/km
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distKm, mid) > vd) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Predicción para otra distancia desde una marca. */
export function predecir(distKm, seg, objetivoKm = DIST_MEDIA) {
  const v = vdot(distKm, seg);
  return {
    riegel: riegel(seg, distKm, objetivoKm),
    vdot: v,
    vdotTiempo: v ? tiempoParaVdot(v, objetivoKm) : null,
  };
}

/** Objetivo más exigente que se alcanza con un tiempo (objetivos con {id, tiempo}). */
export function objetivoParaTiempo(seg, objetivos) {
  if (!(seg > 0)) return null;
  const lista = (Array.isArray(objetivos) ? objetivos : [])
    .map(o => ({ id: o.id, s: parseTiempo(o.tiempo) }))
    .filter(o => o.s)
    .sort((a, b) => a.s - b.s);
  for (const o of lista) if (seg <= o.s) return o.id;
  return null;
}

/**
 * Compara un test con sus umbrales en segundos ({alarma, C?, B, A, T, L}).
 * Devuelve el nivel más exigente confirmado: 'L', 'T', 'A', 'B', 'C',
 * 'alarma' (más lento que la alarma) o 'C' implícito (entre B y la alarma).
 */
export function clasificarTest(seg, umbrales) {
  if (!(seg > 0) || !umbrales || typeof umbrales !== 'object') return null;
  for (const k of ['L', 'T', 'A', 'B', 'C']) {
    if (typeof umbrales[k] === 'number' && seg <= umbrales[k]) return { nivel: k, implicito: false };
  }
  if (typeof umbrales.alarma === 'number') {
    if (seg > umbrales.alarma) return { nivel: 'alarma', implicito: false };
    return { nivel: 'C', implicito: true };
  }
  return { nivel: null, implicito: false };
}

/**
 * ¿Los umbrales de un test son ritmos por km (p. ej. la simulación de la S14:
 * 339 = 5:39/km) en lugar de tiempos totales? Todos por debajo de 15:00.
 */
export function umbralesSonRitmo(umbrales) {
  if (!umbrales || typeof umbrales !== 'object') return false;
  const v = Object.values(umbrales).filter(x => typeof x === 'number');
  return v.length > 0 && v.every(x => x < 900);
}

/* ===================== Nutrición ===================== */

export const CONTEXTOS_NUTRICION = [
  'Víspera de tirada larga', 'Día de tirada larga', 'Víspera de series o tempo',
  'Día de series después del trabajo', 'Después de sesión de calidad nocturna', 'Día de fuerza',
  'Día de descanso', 'Rodaje suave', 'Rodaje suave en ayunas (opcional)', 'Semana de descarga',
  'Tirada larga con práctica de geles', 'Semana de carrera (días -7 a -3)',
  'Semana de carrera (días -2 y -1: carga de hidratos)', 'Mañana de carrera', 'Durante la carrera',
  'Después de la carrera', 'Calor', 'Frío', 'Si duermes mal', 'Fatiga persistente', 'Vuelta tras el parón',
];

/** FNV-1a de 32 bits: el mismo texto da siempre el mismo número. */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Variante determinista por fecha: no cambia al recargar. */
export function elegirAviso(avisos, contexto, fecha) {
  if (!Array.isArray(avisos) || !contexto) return null;
  const lista = avisos.filter(a => a && a.contexto === contexto && a.texto);
  if (!lista.length) return null;
  return lista[hash32(`${fecha}|${contexto}`) % lista.length];
}

const TIPOS_CALIDAD_NUTRI = new Set(['umbral', 'series', 'ritmo', 'cuestas', 'fartlek', 'test']);

/**
 * Contexto deducido por reglas cuando el día no trae `nutricion`.
 * info: { carreraFecha, descarga, semanaN }
 */
export function deducirContexto(hoy, manana, fecha, info = {}) {
  const t = hoy ? hoy.tipo : null;
  const tm = manana ? manana.tipo : null;
  if (info.carreraFecha) {
    const d = difDias(fecha, info.carreraFecha);
    if (d === 0) return 'Mañana de carrera';
    if (d === 1 || d === 2) return 'Semana de carrera (días -2 y -1: carga de hidratos)';
    if (d >= 3 && d <= 7) return 'Semana de carrera (días -7 a -3)';
    if (d === -1) return 'Después de la carrera';
  }
  if (t === 'carrera') return 'Mañana de carrera';
  if (tm === 'carrera') return 'Semana de carrera (días -2 y -1: carga de hidratos)';
  if (t === 'larga') return hoy.geles ? 'Tirada larga con práctica de geles' : 'Día de tirada larga';
  if (tm === 'larga') return 'Víspera de tirada larga';
  if (t === 'test') return diaSemana(fecha) >= 5 ? 'Mañana de carrera' : 'Día de series después del trabajo';
  if (TIPOS_CALIDAD_NUTRI.has(t)) return 'Día de series después del trabajo';
  if (TIPOS_CALIDAD_NUTRI.has(tm)) return 'Víspera de series o tempo';
  if (info.descarga && t !== 'fuerza') return 'Semana de descarga';
  if (t === 'fuerza' || (hoy && hoy.fuerza)) return 'Día de fuerza';
  if (info.semanaN != null && info.semanaN <= 1 && (t === 'facil' || t === 'recuperacion')) return 'Vuelta tras el parón';
  if (!hoy || t === 'descanso') return 'Día de descanso';
  return 'Rodaje suave';
}

/**
 * Aviso del día: usa `sesion.nutricion` si existe en los avisos; si no, el
 * contexto deducido. Devuelve {contexto, momento, texto, deducido} o null.
 */
export function avisoDelDia(avisos, sesion, manana, fecha, info = {}) {
  const ctx1 = sesion && sesion.nutricion;
  let a = ctx1 ? elegirAviso(avisos, ctx1, fecha) : null;
  if (a) return { ...a, deducido: false };
  const ctx2 = deducirContexto(sesion, manana, fecha, info);
  a = elegirAviso(avisos, ctx2, fecha);
  return a ? { ...a, deducido: true } : null;
}

/* ===================== Plan ===================== */

export function planValido(p) {
  return !!p && typeof p === 'object' && Array.isArray(p.semanas) &&
    p.semanas.some(s => s && Array.isArray(s.dias) && s.dias.length > 0);
}

export function indexarPlan(plan) {
  const dias = new Map();
  const semanas = [];
  for (const s of (plan && Array.isArray(plan.semanas) ? plan.semanas : [])) {
    if (!s || !esFechaISO(s.inicio)) continue;
    semanas.push(s);
    for (const d of (Array.isArray(s.dias) ? s.dias : [])) {
      if (d && esFechaISO(d.fecha)) dias.set(d.fecha, { ...d, semana: s.n });
    }
  }
  semanas.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  const fechas = [...dias.keys()].sort();
  return { plan, dias, semanas, primerDia: fechas[0] || null, ultimoDia: fechas[fechas.length - 1] || null };
}

export function semanaDe(idx, fecha) {
  if (!idx || !esFechaISO(fecha)) return null;
  return idx.semanas.find(s => fecha >= s.inicio && fecha <= sumarDias(s.inicio, 6)) || null;
}

export function faseDe(plan, n) {
  if (n == null) return null;
  return (plan && Array.isArray(plan.fases) ? plan.fases : [])
    .find(f => Array.isArray(f.semanas) && n >= f.semanas[0] && n <= f.semanas[1]) || null;
}

/** Tabla de ritmos vigente en una fecha (o la más cercana anterior). */
export function ritmosVigentes(plan, fecha) {
  const lista = (plan && Array.isArray(plan.ritmos) ? plan.ritmos : [])
    .filter(r => r && esFechaISO(r.desde))
    .slice()
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  if (!lista.length) return null;
  const exacta = lista.find(r => fecha >= r.desde && (!r.hasta || fecha <= r.hasta));
  if (exacta) return exacta;
  const previas = lista.filter(r => r.desde <= fecha);
  return previas.length ? previas[previas.length - 1] : lista[0];
}

export function filaRitmo(tramo, re) {
  if (!tramo || !Array.isArray(tramo.tabla)) return null;
  return tramo.tabla.find(f => re.test(String(f.tipo || ''))) || null;
}

export function testDeFecha(plan, fecha) {
  return (plan && Array.isArray(plan.tests) ? plan.tests : []).find(t => t && t.fecha === fecha) || null;
}

/* ===================== Estado ===================== */

const CLAVES_OBJ = ['registros', 'checkins', 'movimientos', 'ajustes', 'tests', 'fuerza', 'cargas'];

export function estadoVacio() {
  return { v: 1, registros: {}, checkins: {}, movimientos: {}, ajustes: {}, tests: {}, fuerza: {}, cargas: {}, ultimaCopia: null };
}

export function normalizarEstado(s) {
  const e = estadoVacio();
  if (!s || typeof s !== 'object' || Array.isArray(s)) return e;
  for (const k of CLAVES_OBJ) {
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) e[k] = s[k];
  }
  if (s.ultimaCopia && typeof s.ultimaCopia === 'object' && typeof s.ultimaCopia.en === 'string') e.ultimaCopia = s.ultimaCopia;
  return e;
}

export function clonar(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Acepta una copia de la app ({estado: …}) o el estado tal cual. */
export function estadoDesdeImportacion(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const s = json.estado && typeof json.estado === 'object' ? json.estado : json;
  if (!s.registros && !s.checkins) return null;
  return normalizarEstado(s);
}

export function paqueteCopia(estado, { version = APP_VERSION, ahora = new Date(), plan = null } = {}) {
  return {
    app: 'Plan 21K',
    version,
    exportadoEn: ahora.toISOString(),
    fechaLocal: fechaISO(ahora),
    planActualizado: plan && plan.actualizado ? plan.actualizado : null,
    estado,
  };
}

export function necesitaCopia(ultimaCopia, ahoraMs = Date.now(), horas = 12) {
  if (!ultimaCopia || !ultimaCopia.en) return true;
  const t = Date.parse(ultimaCopia.en);
  return !isFinite(t) || ahoraMs - t > horas * 3600000;
}

export function haceTexto(instanteISO, ahoraMs = Date.now()) {
  const t = Date.parse(instanteISO);
  if (!isFinite(t)) return 'nunca';
  const min = Math.max(0, Math.round((ahoraMs - t) / 60000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/* ===================== Tipos de sesión ===================== */

export const TIPOS = ['descanso', 'facil', 'recuperacion', 'larga', 'umbral', 'series', 'ritmo', 'cuestas', 'fartlek', 'test', 'carrera', 'fuerza'];
export const TIPOS_CALIDAD = new Set(['umbral', 'series', 'ritmo', 'cuestas', 'fartlek']);
export const TIPOS_DUROS = new Set(['umbral', 'series', 'ritmo', 'cuestas', 'fartlek', 'larga', 'test', 'carrera']);

export const esDura = s => !!s && TIPOS_DUROS.has(s.tipo);
export const esCalidad = s => !!s && TIPOS_CALIDAD.has(s.tipo);
export const esFacil = s => !!s && (s.tipo === 'facil' || s.tipo === 'recuperacion');
export const corre = s => !!s && s.tipo !== 'descanso' && s.tipo !== 'fuerza' &&
  ((Number(s.kmPlan) || 0) > 0 || (Number(s.minPlan) || 0) > 0);
export const planificada = s => !!s && s.tipo !== 'descanso' && (corre(s) || s.tipo === 'fuerza' || !!s.fuerza);
export const esRecolocable = s => !!s && (s.tipo === 'larga' || TIPOS_CALIDAD.has(s.tipo) ||
  (s.clave === true && !['test', 'carrera', 'descanso'].includes(s.tipo)));

/* ===================== Calendario efectivo ===================== */

/**
 * Vista del plan con los movimientos (fecha original -> nueva) y los ajustes
 * aceptados (`cambio` sobre la fecha) aplicados.
 */
export function crearVista(idx, estado) {
  const mov = (estado && estado.movimientos) || {};
  const inv = {};
  for (const o of Object.keys(mov)) {
    const n = mov[o];
    if (esFechaISO(n) && n !== o) inv[n] = o;
  }
  const cambios = {};
  for (const a of Object.values((estado && estado.ajustes) || {})) {
    if (!a || a.decision !== 'aceptado' || !a.cambio || !esFechaISO(a.fecha)) continue;
    const prev = cambios[a.fecha];
    if (!prev || String(a.en || '') >= String(prev.en || '')) cambios[a.fecha] = a;
  }
  const cache = new Map();

  function origenEn(fecha) {
    if (inv[fecha]) return inv[fecha];
    if (mov[fecha] && mov[fecha] !== fecha) return null;
    return fecha;
  }

  function sesion(fecha) {
    if (cache.has(fecha)) return cache.get(fecha);
    let res = null;
    const o = origenEn(fecha);
    const base = o && idx ? idx.dias.get(o) : null;
    const aj = cambios[fecha];
    const dentro = !!(idx && idx.dias.has(fecha));
    if (base || aj || dentro) {
      const relleno = { tipo: 'descanso', titulo: 'Descanso', kmPlan: 0, minPlan: 0, bloques: [], semana: dentro ? idx.dias.get(fecha).semana : null };
      res = { ...(base || relleno), fecha, fechaOriginal: o || fecha, movida: !!o && o !== fecha, ajuste: null };
      if (aj) {
        Object.assign(res, aj.cambio);
        res.fecha = fecha;
        res.ajuste = { id: aj.id, regla: aj.regla, texto: aj.texto || '' };
      }
    }
    cache.set(fecha, res);
    return res;
  }

  return { sesion, origenEn };
}

/** Intercambia las sesiones que se ven en dos fechas. Devuelve movimientos nuevos. */
export function intercambiar(movimientos, vista, fechaA, fechaB) {
  const oA = vista.origenEn(fechaA) || fechaA;
  const oB = vista.origenEn(fechaB) || fechaB;
  const m = { ...(movimientos || {}) };
  m[oA] = fechaB;
  m[oB] = fechaA;
  for (const k of Object.keys(m)) if (m[k] === k) delete m[k];
  return m;
}

/**
 * Mueve (intercambia) la sesión de `desde` con la de `hasta`. Si alguna sesión
 * cae en un día ya pasado, se marca como perdida (decisión 'perdida') para que
 * la regla de recolocar no la proponga. Devuelve {estado, marcadas}.
 */
export function moverSesion(estado, idx, desde, hasta, hoy, ahora = new Date().toISOString()) {
  const e = normalizarEstado(clonar(estado));
  const vista = crearVista(idx, e);
  const oDesde = vista.origenEn(desde) || desde;
  const oHasta = vista.origenEn(hasta) || hasta;
  e.movimientos = intercambiar(e.movimientos, vista, desde, hasta);
  const marcadas = [];
  const marcar = (orig, fecha) => {
    const id = `recolocar:${orig}`;
    if (e.ajustes[id]) return;
    e.ajustes[id] = { id, regla: 'recolocar', fecha, titulo: 'Sesión desplazada a un día pasado: se pierde', en: ahora, decision: 'perdida' };
    marcadas.push(id);
  };
  if (desde < hoy) marcar(oHasta, desde);
  if (hasta < hoy) marcar(oDesde, hasta);
  return { estado: e, marcadas };
}

/** Primera pareja de días duros seguidos alrededor de las fechas dadas, o null. */
export function durosSeguidos(vista, fechas) {
  const vistos = new Set();
  for (const f of fechas) {
    for (const x of [sumarDias(f, -1), f]) {
      if (vistos.has(x)) continue;
      vistos.add(x);
      const y = sumarDias(x, 1);
      if (esDura(vista.sesion(x)) && esDura(vista.sesion(y))) return [x, y];
    }
  }
  return null;
}

function tieneCambio(estado, fecha) {
  return Object.values(estado.ajustes || {}).some(a => a && a.decision === 'aceptado' && a.cambio && a.fecha === fecha);
}

/** Días de la misma semana a los que se puede mover la sesión de `fecha`. */
export function opcionesMover(idx, estado, fecha, hoy) {
  const vista = crearVista(idx, estado);
  const lunes = lunesDe(fecha);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i);
    if (f === fecha) continue;
    const s = vista.sesion(f);
    let motivo = null;
    if (!s) motivo = 'fuera del plan';
    else if (f < hoy) motivo = 'ya ha pasado';
    else if (estado.registros[f]) motivo = 'ya registrado';
    else if (tieneCambio(estado, f) || tieneCambio(estado, fecha)) motivo = 'tiene un ajuste';
    let aviso = null;
    if (!motivo) {
      const e2 = { ...estado, movimientos: intercambiar(estado.movimientos, vista, fecha, f) };
      aviso = durosSeguidos(crearVista(idx, e2), [fecha, f]);
    }
    out.push({ fecha: f, sesion: s, disponible: !motivo, motivo, aviso });
  }
  return out;
}

/* ===================== Resúmenes y estadísticas ===================== */

export function estadoDia(s, r, fecha, hoy) {
  if (r) return r.estado || 'hecho';
  if (!planificada(s)) return 'descanso';
  if (fecha < hoy) return 'sin-registrar';
  return fecha === hoy ? 'hoy' : 'pendiente';
}

export function resumenSemana(idx, estado, vista, lunes, hoy) {
  const dias = [];
  let kmPlan = 0;
  let kmHechos = 0;
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i);
    const s = vista.sesion(f);
    const r = estado.registros[f] || null;
    if (s) kmPlan += Number(s.kmPlan) || 0;
    if (r && r.estado !== 'omitido') kmHechos += Number(r.km) || 0;
    dias.push({ fecha: f, sesion: s, registro: r, estado: estadoDia(s, r, f, hoy) });
  }
  return {
    lunes,
    domingo: sumarDias(lunes, 6),
    dias,
    kmPlan: redondearMedio(kmPlan),
    kmHechos: Math.round(kmHechos * 10) / 10,
    semana: semanaDe(idx, lunes),
  };
}

export function tendencia(valores, n = 4) {
  if (!Array.isArray(valores) || valores.length < 2) return null;
  const media = a => a.reduce((x, y) => x + y, 0) / a.length;
  const ult = valores.slice(-n);
  const prev = valores.slice(-2 * n, -n);
  const mu = media(ult);
  return { media: mu, cambio: prev.length ? mu - media(prev) : null };
}

export function estadisticas(idx, estado, vista, hoy) {
  const semanas = idx.semanas.map(s => {
    const r = resumenSemana(idx, estado, vista, lunesDe(s.inicio), hoy);
    return { n: s.n, inicio: r.lunes, kmPlan: r.kmPlan, kmHechos: r.kmHechos, actual: hoy >= r.lunes && hoy <= r.domingo, futura: r.lunes > hoy };
  });

  const fechas = idx.primerDia && idx.primerDia <= hoy ? fechasEntre(idx.primerDia, hoy) : [];
  let previstas = 0;
  let cumplidas = 0;
  for (const f of fechas) {
    const s = vista.sesion(f);
    const r = estado.registros[f];
    if (!planificada(s)) continue;
    if (f === hoy && !r) continue;
    previstas++;
    if (r && r.estado === 'hecho') cumplidas += 1;
    else if (r && r.estado === 'parcial') cumplidas += 0.5;
  }

  let racha = 0;
  for (let i = fechas.length - 1; i >= 0; i--) {
    const f = fechas[i];
    const s = vista.sesion(f);
    const r = estado.registros[f];
    if (!planificada(s)) continue;
    if (f === hoy && !r) continue;
    if (r && (r.estado === 'hecho' || r.estado === 'parcial')) racha++;
    else break;
  }

  let kmTotales = 0;
  let larga = null;
  const rpeFacil = [];
  for (const f of Object.keys(estado.registros).filter(esFechaISO).sort()) {
    const r = estado.registros[f];
    if (!r || r.estado === 'omitido') continue;
    const km = Number(r.km) || 0;
    kmTotales += km;
    if (km > 0 && (!larga || km > larga.km)) larga = { fecha: f, km };
    if (num(r.rpe) != null && esFacil(vista.sesion(f))) rpeFacil.push({ fecha: f, rpe: r.rpe });
  }

  return {
    semanas,
    previstas,
    cumplidas,
    cumplimiento: previstas ? cumplidas / previstas : null,
    racha,
    kmTotales: Math.round(kmTotales * 10) / 10,
    larga,
    rpeFacil,
    tendenciaRpe: tendencia(rpeFacil.map(x => x.rpe)),
  };
}

/** Último resultado de test (o carrera) con tiempo y distancia; no cuenta las simulaciones a ritmo. */
export function ultimoTest(estado) {
  const lista = Object.entries((estado && estado.tests) || {})
    .map(([clave, t]) => ({ clave, ...t }))
    .filter(t => t.segundos > 0 && t.distanciaKm > 0 && !t.esRitmo)
    .sort((a, b) => (String(a.fecha || a.clave) < String(b.fecha || b.clave) ? -1 : 1));
  return lista.length ? lista[lista.length - 1] : null;
}

/* ===================== Reglas de ajuste ===================== */

export function dolorDe(estado, fecha) {
  const a = num(estado.checkins && estado.checkins[fecha] ? estado.checkins[fecha].dolor : null);
  const b = num(estado.registros && estado.registros[fecha] ? estado.registros[fecha].dolor : null);
  if (a == null && b == null) return null;
  return Math.max(a ?? 0, b ?? 0);
}

/** Dolor de referencia: el de hoy si hay dato; si no, el de ayer. Y la racha de días ≥3. */
export function infoDolor(estado, hoy) {
  const ayer = sumarDias(hoy, -1);
  const ref = dolorDe(estado, hoy) != null ? hoy : ayer;
  const nivel = dolorDe(estado, ref) ?? 0;
  let racha = 0;
  for (let f = ref, i = 0; i < 60; i++, f = sumarDias(f, -1)) {
    const d = dolorDe(estado, f);
    if (d != null && d >= 3) racha++;
    else break;
  }
  return { ref, nivel, racha };
}

export function checkinMalo(c) {
  if (!c) return [];
  const motivos = [];
  if (num(c.sueno) != null && num(c.energia) != null && c.sueno <= 2 && c.energia <= 2) motivos.push('sueño y energía bajos');
  if (num(c.piernas) != null && c.piernas <= 2) motivos.push('piernas cargadas');
  return motivos;
}

/** Prioridad al recolocar: larga 4 > calidad 1 (Q1) 3 > fuerza A 2 > calidad 2 (Q2) 1 > resto 0. */
export function rango(idx, s) {
  if (!s) return 0;
  let r = 0;
  if (s.tipo === 'larga') r = 4;
  else if (TIPOS_CALIDAD.has(s.tipo)) r = esPrimeraCalidad(idx, s) ? 3 : 1;
  if (r < 2 && /^A/i.test(String(s.fuerza || ''))) r = 2;
  return r;
}

function esPrimeraCalidad(idx, s) {
  const o = s.fechaOriginal || s.fecha;
  const lunes = lunesDe(o);
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i);
    const d = idx.dias.get(f);
    if (d && TIPOS_CALIDAD.has(d.tipo)) return f === o;
  }
  return false;
}

/** ¿Quedan 48 h hasta la siguiente sesión dura (y desde la anterior)? */
export function hueco48h(vista, f, ignorar) {
  for (let k = 1; k <= 7; k++) {
    const x = sumarDias(f, k);
    if (x === ignorar) continue;
    if (esDura(vista.sesion(x))) {
      if (k < 2) return false;
      break;
    }
  }
  for (let k = 1; k <= 7; k++) {
    const x = sumarDias(f, -k);
    if (x === ignorar) continue;
    if (esDura(vista.sesion(x))) {
      if (k < 2) return false;
      break;
    }
  }
  return true;
}

function zonasTexto(estado, fecha) {
  const r = estado.registros[fecha];
  const z = r && Array.isArray(r.zonaDolor) ? r.zonaDolor : [];
  return z.length ? ` (${z.join(', ')})` : '';
}

function cambioDescansoDolor() {
  return {
    tipo: 'descanso', titulo: 'Descanso por dolor', clave: false, kmPlan: 0, minPlan: 0,
    objetivo: 'Sin correr. Movilidad suave si no duele.',
    bloques: [],
    porque: 'Con dolor de 3/10 o más, unos días sin impacto evitan que una molestia acabe en lesión.',
    alternativa: 'Bici o elíptica suave, solo si no duele.',
    fuerza: null, nutricion: 'Día de descanso', geles: false,
  };
}

function cambioMuySuave() {
  return {
    tipo: 'recuperacion', titulo: 'Rodaje muy suave', clave: false, kmPlan: 3.5, minPlan: 25,
    objetivo: "20-30' · FC por debajo de 135 · en llano",
    bloques: [{ parte: 'principal', texto: "20-30' muy suaves en llano. Si el dolor sube o cambia tu forma de correr, para y vuelve andando." }],
    porque: 'Moverse suave ayuda; forzar con dolor alarga la molestia.',
    alternativa: 'Bici o elíptica suave.',
    fuerza: null, nutricion: 'Rodaje suave', geles: false,
  };
}

function cambioFacil(plan, fecha, s) {
  const fila = filaRitmo(ritmosVigentes(plan, fecha), /f[aá]cil/i);
  const ritmo = fila ? ritmoMedioDeTexto(fila.ritmo) : null;
  const km = ritmo ? redondearMedio((35 * 60) / ritmo) : 5;
  return {
    tipo: 'facil', titulo: "Rodaje fácil 30-40'", clave: false, kmPlan: km, minPlan: 35,
    objetivo: fila ? `${fila.ritmo}/km · FC ${fila.fc}` : 'FC 135-150 · charla fluida',
    bloques: [{ parte: 'principal', texto: "30-40' fáciles, en llano si puedes. Si la FC pasa de 150, afloja o camina en las subidas." }],
    porque: 'Con mala noche o piernas cargadas, la calidad rinde poco y cansa mucho. Hoy suman más los minutos fáciles.' +
      (s && s.fuerza ? ' Si haces la fuerza, que sea ligera.' : ''),
    alternativa: s && s.alternativa ? s.alternativa : null,
    nutricion: 'Rodaje suave', geles: false,
  };
}

function reglaDolor(ctx, info) {
  const { estado, hoy, vista } = ctx;
  const out = [];
  if (info.nivel < 3) return out;
  const zonas = zonasTexto(estado, info.ref);
  const grave = info.nivel >= 5 || info.racha >= 2;
  if (grave) {
    const id = `dolor-consulta:${info.ref}`;
    if (!estado.ajustes[id]) {
      out.push({
        id, regla: 'dolor', nivel: 'alerta', fecha: hoy,
        titulo: info.racha >= 2 ? `Dolor ${info.racha} días seguidos` : `Dolor de ${info.nivel}/10`,
        texto: info.racha >= 2
          ? `Llevas ${info.racha} días con dolor de 3/10 o más${zonas}. Para de correr y, si no mejora en 2-3 días o te hace cojear, consulta a un fisio o a un médico. Bici o elíptica, solo si no duele.`
          : `Dolor de ${info.nivel}/10${zonas}: hoy no corras. Si es un dolor localizado en el hueso, hay hinchazón o cojeas, para y consulta a un fisio o a un médico.`,
        opciones: [{ id: 'visto', texto: 'Entendido', principal: true }],
      });
    }
  }
  const s = vista.sesion(hoy);
  const id = `dolor:${hoy}`;
  if (s && corre(s) && !estado.registros[hoy] && !s.ajuste && !estado.ajustes[id]) {
    const acciones = { descanso: { fecha: hoy, cambio: cambioDescansoDolor(), texto: 'Descanso por dolor' } };
    const opciones = [{ id: 'descanso', texto: 'Descanso hoy', principal: true }];
    if (!grave) {
      acciones.suave = { fecha: hoy, cambio: cambioMuySuave(), texto: 'Rodaje muy suave por dolor' };
      opciones.push({ id: 'suave', texto: "Muy suave 20-30'" });
    }
    opciones.push({ id: 'rechazar', texto: 'Mantener' });
    out.push({
      id, regla: 'dolor', nivel: 'propuesta', fecha: hoy,
      titulo: `Dolor ${info.nivel}/10${zonas}`,
      texto: `Hoy tocaba «${s.titulo}». Con dolor de 3/10 o más: descanso${grave ? '' : ", o un rodaje muy suave de 20-30' en llano si no cambia tu forma de correr"}. Si dura 2-3 días, para y consulta.`,
      opciones, acciones,
    });
  }
  return out;
}

function reglaCheckin(ctx, bloqueada) {
  const { idx, estado, hoy, vista } = ctx;
  if (bloqueada) return null;
  const motivos = checkinMalo(estado.checkins[hoy]);
  if (!motivos.length) return null;
  const s = vista.sesion(hoy);
  const id = `checkin:${hoy}`;
  if (!s || !esCalidad(s) || s.ajuste || estado.registros[hoy] || estado.ajustes[id]) return null;
  return {
    id, regla: 'checkin', nivel: 'propuesta', fecha: hoy,
    titulo: "Hoy, mejor fácil de 30-40'",
    texto: `Check-in con ${motivos.join(' y ')}. En lugar de «${s.titulo}», haz un rodaje fácil de 30-40'.`,
    opciones: [{ id: 'aceptar', texto: 'Cambiar a fácil', principal: true }, { id: 'rechazar', texto: 'Mantener' }],
    acciones: { aceptar: { fecha: hoy, cambio: cambioFacil(idx.plan, hoy, s), texto: 'Fácil por check-in bajo' } },
  };
}

function reglaRecolocar(ctx, bloquearHoy) {
  const { idx, estado, hoy, ayer, vista } = ctx;
  const s = vista.sesion(ayer);
  if (!s || !esRecolocable(s) || s.ajuste) return null;
  const r = estado.registros[ayer];
  if (r && r.estado !== 'omitido') return null;
  const id = `recolocar:${s.fechaOriginal}`;
  if (estado.ajustes[id]) return null;

  const rs = rango(idx, s);
  const domingo = sumarDias(lunesDe(hoy), 6);
  let libre = null;
  let sustituto = null;
  for (let f = bloquearHoy ? sumarDias(hoy, 1) : hoy; f <= domingo; f = sumarDias(f, 1)) {
    if (estado.registros[f] || tieneCambio(estado, f)) continue;
    const c = vista.sesion(f);
    if (!c || c.tipo === 'test' || c.tipo === 'carrera') continue;
    const rc = rango(idx, c);
    if (rc >= rs || !hueco48h(vista, f, ayer)) continue;
    if (!esDura(c) && rc === 0) {
      libre = { f, c };
      break;
    }
    if (!sustituto) sustituto = { f, c };
  }

  const elegido = libre || sustituto;
  if (!elegido) {
    return {
      id, regla: 'recolocar', nivel: 'aviso', fecha: hoy,
      titulo: 'La sesión de ayer se pierde',
      texto: `«${s.titulo}» no cabe esta semana dejando 48 h hasta la siguiente sesión dura. No la acumules: sigue con el plan.`,
      opciones: [{ id: 'visto', texto: 'Entendido', principal: true }],
    };
  }

  const { f, c } = elegido;
  const sustituye = elegido === sustituto;
  const larga = s.tipo === 'larga';
  const cuando = f === hoy ? 'hoy' : `el ${fechaLarga(f)}`;
  let texto = `Ayer no se hizo «${s.titulo}». Puedes hacerla ${cuando}`;
  if (sustituye) texto += `, en lugar de «${c.titulo}», que se pierde.`;
  else if (c.tipo === 'descanso') texto += ', que era día de descanso.';
  else texto += `; ese día tocaba «${c.titulo}», que se pierde.`;
  texto += ' Quedan 48 h o más hasta la siguiente sesión dura.';
  let cambio = null;
  if (larga) {
    texto += ' Hazla un 20 % más corta y sin bloques.';
    const km = redondearMedio((Number(s.kmPlan) || 0) * 0.8);
    cambio = {
      kmPlan: km,
      minPlan: Math.round((Number(s.minPlan) || 0) * 0.8),
      titulo: `${s.titulo} (−20 %)`,
      bloques: [{ parte: 'principal', texto: `${fmtNum(km, 1)} km fáciles, sin bloques a ritmo.` }],
    };
  }
  return {
    id, regla: 'recolocar', nivel: 'propuesta', fecha: hoy,
    titulo: larga ? 'Recolocar la tirada larga' : 'Recolocar la sesión de ayer',
    texto,
    opciones: [
      { id: 'aceptar', texto: f === hoy ? 'Hacerla hoy' : `Pasarla al ${DIAS_LARGO[diaSemana(f)]}`, principal: true },
      { id: 'rechazar', texto: 'No, se pierde' },
    ],
    acciones: { aceptar: { mover: { desde: ayer, hasta: f }, fecha: f, cambio, texto: 'Recolocada desde el día anterior' } },
  };
}

function reglaZonaGris(ctx) {
  const { estado, hoy, vista } = ctx;
  const lunes = lunesDe(hoy);
  const id = `zonagris:${lunes}`;
  if (estado.ajustes[id]) return null;
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i);
    if (f > hoy) break;
    const r = estado.registros[f];
    if (!r || r.estado === 'omitido' || !(num(r.rpe) >= 8)) continue;
    if (esFacil(vista.sesion(f))) n++;
  }
  if (n < 2) return null;
  return {
    id, regla: 'zonagris', nivel: 'aviso', fecha: hoy,
    titulo: 'Zona gris en los rodajes',
    texto: `Esta semana llevas ${n} rodajes fáciles con esfuerzo de 8/10 o más. Eso no es fácil: baja el ritmo hasta FC 135-150 y camina en las cuestas, aunque te parezca ridículamente lento.`,
    opciones: [{ id: 'visto', texto: 'Entendido', principal: true }],
  };
}

function reglaVuelta(ctx) {
  const { idx, estado, hoy } = ctx;
  if (!idx.primerDia || hoy < idx.primerDia || (idx.ultimoDia && hoy > idx.ultimoDia)) return null;
  const inicio = sumarDias(idx.primerDia, -1);
  const fechas = Object.keys(estado.registros).filter(f => esFechaISO(f) && f <= hoy).sort();
  const ultima = fechas.length ? fechas[fechas.length - 1] : null;
  const ref = ultima && ultima > inicio ? ultima : inicio;
  const dias = difDias(ref, hoy);
  if (!(dias >= 6)) return null;
  const id = `vuelta:${ref}`;
  if (estado.ajustes[id]) return null;
  const mitad = Math.ceil(dias / 2);
  return {
    id, regla: 'vuelta', nivel: 'aviso', fecha: hoy,
    titulo: `${dias} días sin registrar`,
    texto: dias > 14
      ? 'Si no has corrido, no retomes el plan donde lo dejaste: reprograma la fase y valora bajar un escalón de objetivo (de A a B, o de B a C). Si sí has corrido, registra lo que hiciste.'
      : `Si no has corrido, vuelve poco a poco: unos ${mitad} días al 50 % del volumen y otros ${mitad} al 75 %, sin calidad hasta hacer 2-3 rodajes normales. Si sí has corrido, registra lo hecho.`,
    opciones: [{ id: 'visto', texto: 'Entendido', principal: true }],
  };
}

/**
 * Evalúa las reglas para `hoy`. Devuelve propuestas ordenadas
 * (alertas, propuestas y avisos). Cada propuesta: {id, regla, nivel, fecha,
 * titulo, texto, opciones:[{id, texto, principal}], acciones?:{opcion: {...}}}.
 */
export function evaluarReglas({ idx, estado, hoy, vista }) {
  if (!idx) return [];
  const v = vista || crearVista(idx, estado);
  const ctx = { idx, estado, hoy, ayer: sumarDias(hoy, -1), vista: v };
  const info = infoDolor(estado, hoy);
  const conDolor = info.nivel >= 3;
  const res = [];
  res.push(...reglaDolor(ctx, info));
  const ck = reglaCheckin(ctx, conDolor);
  if (ck) res.push(ck);
  if (!conDolor) {
    const rc = reglaRecolocar(ctx, checkinMalo(estado.checkins[hoy]).length > 0);
    if (rc) res.push(rc);
  }
  const zg = reglaZonaGris(ctx);
  if (zg) res.push(zg);
  const vu = reglaVuelta(ctx);
  if (vu) res.push(vu);
  const orden = { alerta: 0, propuesta: 1, aviso: 2 };
  return res.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

/** Aplica la decisión de Fran sobre una propuesta. Devuelve un estado nuevo. */
export function aplicarPropuesta(estado, p, opcion, idx, ahora = new Date().toISOString()) {
  let e = normalizarEstado(clonar(estado));
  const reg = { id: p.id, regla: p.regla, fecha: p.fecha, titulo: p.titulo, en: ahora, opcion };
  const acc = p.acciones ? p.acciones[opcion] : null;
  if (!acc) {
    e.ajustes[p.id] = { ...reg, decision: opcion === 'rechazar' ? 'rechazado' : 'visto' };
    return e;
  }
  if (acc.mover) {
    const r = moverSesion(e, idx, acc.mover.desde, acc.mover.hasta, p.fecha, ahora);
    e = r.estado;
    reg.swap = [acc.mover.desde, acc.mover.hasta];
    reg.marcadas = r.marcadas.filter(x => x !== p.id);
  }
  e.ajustes[p.id] = { ...reg, decision: 'aceptado', fecha: acc.fecha || p.fecha, cambio: acc.cambio || null, texto: acc.texto || p.titulo };
  return e;
}

/** Deshace un ajuste (y su movimiento, si lo hubo). La regla puede volver a proponerse. */
export function deshacerAjuste(estado, id, idx) {
  const e = normalizarEstado(clonar(estado));
  const a = e.ajustes[id];
  if (!a) return e;
  if (a.decision === 'aceptado' && Array.isArray(a.swap) && a.swap.length === 2) {
    e.movimientos = intercambiar(e.movimientos, crearVista(idx, e), a.swap[0], a.swap[1]);
  }
  if (Array.isArray(a.marcadas)) for (const m of a.marcadas) delete e.ajustes[m];
  delete e.ajustes[id];
  return e;
}
