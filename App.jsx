import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Store,
  Share2,
  Printer,
} from "lucide-react";

const STORAGE_KEY = "vdh-objetivo-calendario"; // fallback localStorage (sin capacidad "db")
const UI_PREFS_KEY = "vdh-objetivo-ui-prefs"; // preferencias locales de navegación (no se comparten)
const TEMA_KEY = "vdh-objetivo-tema";
const DB_DOC_PATH = "app/data"; // documento compartido cuando la capacidad "db" está disponible
const DATA_VERSION = 5;
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const DIAS_SEMANA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Convierte el índice de DIAS_SEMANA (0=Lun...6=Dom) al valor que devuelve Date.getDay() (0=Dom...6=Sab).
const JS_WEEKDAY_DE_INDICE = [1, 2, 3, 4, 5, 6, 0];
const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const MESES_CORTO = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

// Paleta prolija y fija para identificar vendedores en el calendario compartido.
// Se asigna en orden a medida que se agregan vendedores (no es elegible a mano).
// Mismos tonos que usa Google Calendar para los eventos (Flamingo, Tangerine, Sage, Peacock,
// Grape, Blueberry, Basil, Tomato, Graphite). El teal queda último a propósito: es el mismo
// color que el acento de toda la interfaz (botones activos, "Hoy", "Guardado"), así que se
// reserva como último recurso para que un vendedor no termine con turnos de ese color.
const PALETA_VENDEDORES = [
  "#E67C73", // flamingo
  "#F4511E", // tangerine
  "#33B679", // sage
  "#039BE5", // peacock
  "#8E24AA", // grape
  "#3F51B5", // blueberry
  "#0B8043", // basil
  "#D50000", // tomato
  "#616161", // graphite
  "#2C6E71", // teal (acento) — reservado, último recurso
];
// Paleta anterior (antes de pasar a los tonos de Calendar), en el mismo orden que tenía. Sirve
// solo para la migración de datos viejos: a un vendedor que ya tenía uno de estos colores
// guardado se le asigna el color de Calendar que está en la misma posición, en vez de dejarlo
// con el tono viejo para siempre.
const PALETA_VENDEDORES_ANTERIOR = [
  "#A97A66", "#6C7BA0", "#B08D3E", "#5E8C61", "#8B5F8C",
  "#4C8C97", "#B0654F", "#7A8C4C", "#5F6C8C", "#2C6E71",
];

// Elige texto blanco o gris oscuro según qué tan clara sea la franja de color de fondo (misma
// idea que usa Calendar: sobre colores claros como el flamingo el texto queda oscuro, sobre los
// más saturados queda blanco), para que el nombre del vendedor siempre se lea bien.
function colorTextoContraste(hex) {
  const c = (hex || "").replace("#", "");
  if (c.length !== 6) return "#fff";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const luminancia = (r * 299 + g * 587 + b * 114) / 1000;
  return luminancia >= 150 ? "#2B2B2B" : "#fff";
}
const COLOR_RESERVADO_ACENTO = PALETA_VENDEDORES[PALETA_VENDEDORES.length - 1];

const uid = () => Math.random().toString(36).slice(2, 10);
const pad2 = (n) => String(n).padStart(2, "0");
const dateKey = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const fechaDeKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
};
const monthPrefix = (y, m) => `${y}-${pad2(m)}`;

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}
function firstWeekdayMonFirst(y, m) {
  const jsDay = new Date(y, m - 1, 1).getDay(); // 0=Dom
  return (jsDay + 6) % 7; // 0=Lun
}
function esHoy(y, m, d) {
  const t = new Date();
  return t.getFullYear() === y && t.getMonth() + 1 === m && t.getDate() === d;
}
function hoyComoFecha() {
  const t = new Date();
  return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate() };
}
function sumarDias(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
// Lunes 00:00 de la semana que contiene `date`.
function lunesDeLaSemana(date) {
  const d = new Date(date);
  const dia = d.getDay(); // 0=Dom...6=Sab
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function diasDeLaSemana(inicio) {
  const arr = [];
  for (let i = 0; i < 7; i++) arr.push(sumarDias(inicio, i));
  return arr;
}
function fmtRangoSemana(inicio) {
  const fin = sumarDias(inicio, 6);
  const mismoMes = inicio.getMonth() === fin.getMonth();
  const mismoAnio = inicio.getFullYear() === fin.getFullYear();
  if (mismoMes) return `${inicio.getDate()}–${fin.getDate()} ${MESES_CORTO[inicio.getMonth()]} ${inicio.getFullYear()}`;
  if (mismoAnio) return `${inicio.getDate()} ${MESES_CORTO[inicio.getMonth()]} – ${fin.getDate()} ${MESES_CORTO[fin.getMonth()]} ${inicio.getFullYear()}`;
  return `${inicio.getDate()} ${MESES_CORTO[inicio.getMonth()]} ${inicio.getFullYear()} – ${fin.getDate()} ${MESES_CORTO[fin.getMonth()]} ${fin.getFullYear()}`;
}
function fmtFechaLarga(fecha) {
  const d = new Date(fecha.year, fecha.month - 1, fecha.day);
  return `${DIAS_SEMANA_LARGO[d.getDay()]} ${fecha.day} de ${MESES[fecha.month - 1]}`;
}
// Cerrado por patrón semanal fijo (ej. "cerramos los domingos") o por fecha puntual (feriado).
function estaCerrado(local, y, m, d) {
  const key = dateKey(y, m, d);
  if ((local.fechasCerradas || []).includes(key)) return true;
  const wd = new Date(y, m - 1, d).getDay();
  return (local.diasCerrados || []).includes(wd);
}
// Horario real de apertura para un día puntual: si ese día de la semana tiene un horario
// especial cargado (ej. domingos 10 a 21) se usa ese; si no, el horario general del local.
function horarioDelDia(local, y, m, d) {
  const wd = new Date(y, m - 1, d).getDay();
  const especial = (local.horariosEspeciales || {})[wd];
  return {
    inicio: especial?.inicio || local.horaInicio || "08:00",
    fin: especial?.fin || local.horaFin || "22:00",
  };
}
// Vacaciones de un vendedor: rangos de fechas puntuales (ambas fechas inclusive), guardados en
// vendedor.vacaciones. Un vendedor puede tener varios rangos sueltos a la vez.
function estaDeVacaciones(vendedor, y, m, d) {
  const key = dateKey(y, m, d);
  return (vendedor.vacaciones || []).some((r) => key >= r.inicio && key <= r.fin);
}
// Vendedores de un local que están de vacaciones un día puntual (para marcarlo en el calendario).
function vendedoresDeVacaciones(vendedores, y, m, d) {
  return vendedores.filter((v) => estaDeVacaciones(v, y, m, d));
}
// Última fecha (inclusive) de un período de vacaciones: "N semanas desde el inicio" = inicio + N*7 - 1 días.
function finDeVacaciones(inicioISO, semanas) {
  const { year, month, day } = fechaDeKey(inicioISO);
  const fin = sumarDias(new Date(year, month - 1, day), Number(semanas) * 7 - 1);
  return dateKey(fin.getFullYear(), fin.getMonth() + 1, fin.getDate());
}
// Dos rangos de fechas (ISO, ambos inclusive) se pisan si el inicio de uno cae antes del fin del
// otro y viceversa.
function rangosSeSuperponen(aIni, aFin, bIni, bFin) {
  return aIni <= bFin && bIni <= aFin;
}
// Franco fijo de un vendedor: días de la semana (0=Dom...6=Sab, igual convención que
// local.diasCerrados) en los que ese vendedor libra todas las semanas. Rige desde HOY en
// adelante — no afecta días ya pasados, para no tapar horario ya trabajado.
function esFrancoVendedor(vendedor, y, m, d) {
  const wd = new Date(y, m - 1, d).getDay();
  if (!(vendedor.francos || []).includes(wd)) return false;
  const hoy = hoyComoFecha();
  return dateKey(y, m, d) >= dateKey(hoy.year, hoy.month, hoy.day);
}
function vendedoresDeFranco(vendedores, y, m, d) {
  return vendedores.filter((v) => esFrancoVendedor(v, y, m, d));
}
function fmtFechaCorta(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher), para ubicar Carnaval y Viernes Santo.
function domingoDePascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, mes - 1, dia);
}
// Feriados nacionales de Argentina de fecha fija o calculable (Pascua). Los feriados "puente
// turístico" los decreta el gobierno cada año y no se pueden calcular: se cargan a mano como
// fecha puntual cerrada si hace falta.
function feriadosArgentina(year) {
  const pascua = domingoDePascua(year);
  const lista = [
    { fecha: new Date(year, 0, 1), nombre: "Año Nuevo" },
    { fecha: sumarDias(pascua, -48), nombre: "Carnaval" },
    { fecha: sumarDias(pascua, -47), nombre: "Carnaval" },
    { fecha: new Date(year, 2, 24), nombre: "Día de la Memoria" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
    { fecha: new Date(year, 3, 2), nombre: "Veteranos de Malvinas" },
    { fecha: new Date(year, 4, 1), nombre: "Día del Trabajador" },
    { fecha: new Date(year, 4, 25), nombre: "25 de Mayo" },
    { fecha: new Date(year, 5, 20), nombre: "Día de la Bandera" },
    { fecha: new Date(year, 6, 9), nombre: "9 de Julio" },
    { fecha: new Date(year, 7, 17), nombre: "Día de San Martín" },
    { fecha: new Date(year, 11, 8), nombre: "Inmaculada Concepción" },
    { fecha: new Date(year, 11, 25), nombre: "Navidad" },
  ];
  const mapa = {};
  lista.forEach(({ fecha, nombre }) => {
    mapa[dateKey(fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate())] = nombre;
  });
  return mapa;
}

// ---- Horarios (turnos) ----
function minutosDe(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minAHHMM(min) {
  const m = Math.max(0, Math.min(23 * 60 + 30, min));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
function generarOpcionesHora(desde, hasta) {
  const opts = [];
  const desdeMin = minutosDe(desde || "00:00");
  const hastaMin = minutosDe(hasta || "23:30");
  for (let m = desdeMin; m <= hastaMin; m += 30) opts.push(minAHHMM(m));
  if (opts.length === 0) opts.push(minAHHMM(desdeMin));
  return opts;
}
function duracionTurno(t) {
  return Math.max(0, (minutosDe(t.fin) - minutosDe(t.inicio)) / 60);
}
function horasDelDia(diaObj) {
  return (diaObj?.turnos || []).reduce((s, t) => s + duracionTurno(t), 0);
}
function fmtHoraCorta(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
}
function fmtTurno(t) {
  return `${fmtHoraCorta(t.inicio)}-${fmtHoraCorta(t.fin)}`;
}
function fmtResumenDia(diaObj) {
  return (diaObj?.turnos || []).map(fmtTurno).join(", ");
}
function nuevoTurnoDefault(horaInicio, horaFin, existentes) {
  const desdeMin = minutosDe(horaInicio || "08:00");
  const hastaMin = minutosDe(horaFin || "22:00");
  if (!existentes || existentes.length === 0) {
    const finMin = Math.min(desdeMin + 8 * 60, hastaMin);
    return { inicio: minAHHMM(desdeMin), fin: minAHHMM(Math.max(finMin, desdeMin)) };
  }
  const ultimoFin = minutosDe(existentes[existentes.length - 1].fin);
  const inicioMin = Math.min(Math.max(ultimoFin, desdeMin), hastaMin);
  return { inicio: minAHHMM(inicioMin), fin: minAHHMM(hastaMin) };
}

// Fusiona intervalos [inicioMin, finMin] solapados o contiguos, ordenados de menor a mayor.
function mergeIntervalos(intervalos) {
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
  const fusion = [];
  for (const [ini, fin] of ordenados) {
    const ultimo = fusion[fusion.length - 1];
    if (ultimo && ini <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fin);
    else fusion.push([ini, fin]);
  }
  return fusion;
}

// Huecos sin cobertura ese día, dentro del horario del local. Un día sin NADIE cargado
// no se considera "hueco" (todavía no se planificó); el aviso es para cuando ya hay
// gente cargada pero queda una franja sin cubrir.
function huecosDelDia(vendedores, key, horaInicio, horaFin) {
  const intervalos = [];
  vendedores.forEach((v) => {
    const turnos = v.dias[key]?.turnos;
    if (!turnos) return;
    turnos.forEach((t) => intervalos.push([minutosDe(t.inicio), minutosDe(t.fin)]));
  });
  if (intervalos.length === 0) return [];
  const fusion = mergeIntervalos(intervalos);
  const desdeMin = minutosDe(horaInicio);
  const hastaMin = minutosDe(horaFin);
  const huecos = [];
  let cursor = desdeMin;
  for (const [ini, fin] of fusion) {
    if (ini > cursor) huecos.push([cursor, Math.min(ini, hastaMin)]);
    cursor = Math.max(cursor, fin);
    if (cursor >= hastaMin) break;
  }
  if (cursor < hastaMin) huecos.push([cursor, hastaMin]);
  return huecos.filter(([a, b]) => b > a).map(([a, b]) => ({ inicio: minAHHMM(a), fin: minAHHMM(b) }));
}

// Distribuye turnos que se solapan en columnas lado a lado (como Google Calendar) usando un
// algoritmo greedy: mismo ancho de columna para todos los eventos del día, simple y suficiente
// para la cantidad de vendedores de un local.
function disponerEventos(eventos) {
  const ordenados = [...eventos].sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
  const columnas = [];
  const resultado = [];
  ordenados.forEach((ev) => {
    let col = columnas.findIndex((finMin) => finMin <= ev.inicioMin);
    if (col === -1) { col = columnas.length; columnas.push(ev.finMin); }
    else columnas[col] = ev.finMin;
    resultado.push({ ...ev, col });
  });
  const totalCols = Math.max(1, columnas.length);
  return resultado.map((ev) => ({ ...ev, totalCols }));
}

function defaultVendedor(nombre, colorIndex) {
  return {
    id: uid(),
    nombre,
    color: PALETA_VENDEDORES[colorIndex % PALETA_VENDEDORES.length],
    dias: {}, // { "2026-09-05": { turnos: [{inicio:"09:00", fin:"17:00"}, ...] } }
    vacaciones: [], // [{ id, inicio: "2026-11-10", fin: "2026-11-23" }, ...] (ambas fechas inclusive)
    francos: [], // días de la semana (0=Dom...6=Sab) en los que libra fijo todas las semanas
  };
}

// Índice de paleta más bajo que ningún vendedor del local esté usando todavía. Antes se elegía
// por la posición (vendedores.length) al momento de agregar, así que borrar un vendedor del medio
// y agregar uno nuevo podía repetir el color de otro que ya estaba (p.ej. dos vendedores en mostaza).
function indiceColorLibre(vendedoresActuales) {
  const usados = new Set(vendedoresActuales.map((v) => v.color));
  usados.add(COLOR_RESERVADO_ACENTO); // solo se entrega si ya no queda ningún otro color libre
  for (let i = 0; i < PALETA_VENDEDORES.length; i++) {
    if (!usados.has(PALETA_VENDEDORES[i])) return i;
  }
  return vendedoresActuales.length; // paleta agotada (11º+ vendedor): ahí sí se repite un color
}

// Repara datos ya guardados donde dos vendedores del mismo local quedaron con el mismo color
// por el bug de arriba: al primero que aparece lo deja como está, al que choca le da el
// siguiente color libre de la paleta. También le saca el color reservado (el del acento de la
// interfaz) a cualquier vendedor que lo tenga, salvo que ya no quede ningún otro disponible.
function dedupeColoresVendedores(vendedores) {
  const usados = new Set([COLOR_RESERVADO_ACENTO]);
  return vendedores.map((v) => {
    if (v.color !== COLOR_RESERVADO_ACENTO && !usados.has(v.color)) {
      usados.add(v.color);
      return v;
    }
    const libre = PALETA_VENDEDORES.find((c) => !usados.has(c));
    if (!libre) return v; // no queda ningún color libre: se deja como está
    usados.add(libre);
    return { ...v, color: libre };
  });
}

function defaultLocal(nombre) {
  return {
    id: uid(),
    nombre,
    objetivoTotal: 0,
    horaInicio: "08:00",
    horaFin: "22:00",
    diasCerrados: [], // valores de Date.getDay(): 0=Dom...6=Sab
    fechasCerradas: [], // ["2026-12-25", ...] feriados puntuales
    vendedores: [defaultVendedor("", 0)],
  };
}

function defaultSharedData() {
  return {
    version: DATA_VERSION,
    locales: [defaultLocal("Rivadavia"), defaultLocal("San Martín")],
  };
}

// Migra datos guardados con el formato viejo (día -> horas) al nuevo formato (día -> turnos con
// horario, desde la v2). Decisión: empezar de cero en los días cargados, se conserva todo lo
// demás (locales, vendedores, objetivos). Ojo: se compara contra 2 a propósito, NO contra
// DATA_VERSION — si no, cada vez que suba DATA_VERSION por cualquier otro motivo (como pasó al
// sumar la migración de colores de acá abajo) se volverían a borrar todos los turnos cargados.
function migrarDatos(parsed) {
  if (!parsed || !parsed.locales) return defaultSharedData();
  const formatoTurnosYaMigrado = (parsed.version || 0) >= 2;
  // Antes de la v3 los colores de vendedor eran de la paleta vieja (terracota, azul grisáceo,
  // etc.); a quien ya tenía uno de esos guardado se lo pasa al tono de Calendar de la misma
  // posición, para que el cambio de paleta se note también en los vendedores ya cargados.
  const veniaDeAntesDePaletaCalendar = (parsed.version || 0) < 3;
  const locales = parsed.locales.map((l) => {
    return {
      ...l,
      horaInicio: l.horaInicio || "08:00",
      horaFin: l.horaFin || "22:00",
      diasCerrados: l.diasCerrados || [],
      fechasCerradas: l.fechasCerradas || [],
      vendedores: dedupeColoresVendedores(
        l.vendedores.map((v, idx) => {
          let color = v.color || PALETA_VENDEDORES[idx % PALETA_VENDEDORES.length];
          if (veniaDeAntesDePaletaCalendar) {
            const iAnterior = PALETA_VENDEDORES_ANTERIOR.indexOf(color);
            if (iAnterior !== -1) color = PALETA_VENDEDORES[iAnterior];
          }
          return { ...v, color, dias: formatoTurnosYaMigrado ? v.dias || {} : {}, vacaciones: v.vacaciones || [], francos: v.francos || [] };
        })
      ),
    };
  });
  return { ...parsed, locales, version: DATA_VERSION };
}

function fmt(n, dec = 1) {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
function fmtMoney(n) {
  if (!isFinite(n)) return "$0";
  return "$" + Math.round(n).toLocaleString("es-AR");
}

// Input de moneda: muestra $ y puntos de miles mientras se escribe, guarda el número puro
function MoneyInput({ value, onChange, style, placeholder }) {
  const digits = String(value || "").replace(/\D/g, "");
  const display = digits ? "$" + Number(digits).toLocaleString("es-AR") : "";
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, "");
        onChange(raw ? Number(raw) : 0);
      }}
      style={style}
    />
  );
}

export default function App() {
  const now = new Date();

  // sharedData = { version, locales } — dato de negocio, compartido entre dispositivos
  // vía la capacidad "db" cuando está disponible; si no, cae a localStorage (un solo dispositivo).
  const [sharedData, setSharedData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // "idle" (nada que mostrar) | "guardando" | "guardado" (se apaga solo a los 900ms) | "error"
  // (persiste hasta que se reintenta con éxito — antes, si el guardado fallaba, no había
  // ninguna señal más que un console.error, y el cambio se perdía en silencio).
  const [estadoGuardado, setEstadoGuardado] = useState("idle");
  const [syncMode, setSyncMode] = useState("local"); // "db" | "local"
  const retryGuardadoRef = useRef(null);
  const [reintentoGuardadoTick, setReintentoGuardadoTick] = useState(0);
  const forzarReintentoGuardado = () => {
    if (retryGuardadoRef.current) { clearTimeout(retryGuardadoRef.current); retryGuardadoRef.current = null; }
    setReintentoGuardadoTick((t) => t + 1);
  };

  // Deshacer: antes de cada cambio que hace la persona en este dispositivo (no lo que llega
  // sincronizado de otro dispositivo) se guarda cómo estaba ANTES la parte puntual que se tocó
  // (un local completo, o qué local se agregó/borró) — nunca el documento entero. Así, deshacer
  // un cambio hecho en el local "Rivadavia" nunca pisa lo que otra persona esté cargando al mismo
  // tiempo en, por ejemplo, "San Justo": ese otro local ni se toca. Vive solo en esta pestaña —
  // no se persiste ni se sincroniza.
  const undoStack = useRef([]);
  const UNDO_MAX = 25;
  const [hayDeshacer, setHayDeshacer] = useState(false);
  const pushUndo = (accion) => {
    undoStack.current.push(accion);
    if (undoStack.current.length > UNDO_MAX) undoStack.current.shift();
    setHayDeshacer(true);
  };
  const deshacer = () => {
    const accion = undoStack.current.pop();
    if (!accion) return;
    setSharedData((d) => {
      if (accion.tipo === "local") {
        // Restaura ese local puntual a como estaba; a los demás locales no los toca, sin
        // importar qué les haya pasado mientras tanto.
        return { ...d, locales: d.locales.map((l) => (l.id === accion.localId ? accion.localAnterior : l)) };
      }
      if (accion.tipo === "addLocal") {
        // Deshacer "agregar local": sacar ese local puntual (por id, no por posición).
        return { ...d, locales: d.locales.filter((l) => l.id !== accion.localId) };
      }
      if (accion.tipo === "removeLocal") {
        // Deshacer "borrar local": reinsertarlo tal como estaba, en su posición original.
        const locales = [...d.locales];
        locales.splice(Math.min(accion.indice, locales.length), 0, accion.localAnterior);
        return { ...d, locales };
      }
      return d;
    });
    setHayDeshacer(undoStack.current.length > 0);
  };

  // Toast único para avisar "hice esto" (copiar/pegar días, borrar un vendedor o un local,
  // reiniciar el mes): reemplaza los mensajes sueltos que cada acción mostraba a su manera y en
  // su propio lugar de la pantalla. Si la acción es deshacible, el toast ofrece el botón acá
  // mismo en vez de mandar a la persona a buscar el "↩ Deshacer" del header.
  const [toast, setToast] = useState(null); // { mensaje, deshacible } | null
  const toastTimerRef = useRef(null);
  const mostrarToast = (mensaje, { deshacible = false } = {}) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ mensaje, deshacible });
    toastTimerRef.current = setTimeout(() => setToast(null), deshacible ? 6000 : 3200);
  };
  const deshacerDesdeToast = () => {
    deshacer();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  // Estado de navegación y preferencias visuales: de cada persona/dispositivo, no se sincroniza.
  const [localActivoId, setLocalActivoId] = useState(null);
  const [vendedorActivo, setVendedorActivo] = useState(null);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null); // { year, month, day } | null
  const [localOpen, setLocalOpen] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false); // acordeón de "Configuración del local"
  // Paneles laterales plegables (como el menú ☰ de Google Calendar): con un solo botón se van los
  // dos y el calendario pasa a ocupar todo el ancho de la pantalla, que es cuando mejor se lee y
  // mejor sale la foto para mandar al grupo.
  const [panelesAbiertos, setPanelesAbiertos] = useState(true);
  // Portapapeles de "copiar día": todos los turnos de todos los vendedores de un día puntual,
  // para pegarlos en otro. Vive solo en esta pestaña, no se persiste.
  const [diaCopiado, setDiaCopiado] = useState(null); // { localId, dias: [{offsetDias, porVendedor}] } | null
  // Días marcados con Ctrl/Cmd+clic en el calendario para copiarlos todos juntos ("YYYY-MM-DD").
  // Se vacía solo al copiar, o al cambiar de local (los días de otro local no tienen sentido acá).
  const [diasParaCopiar, setDiasParaCopiar] = useState(() => new Set());
  // Para "Compartir imagen": referencia a la tarjeta del calendario (se le saca una foto con
  // html2canvas) y si hay una generación en curso, para deshabilitar el botón mientras tanto.
  const calendarioRef = useRef(null);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  // A quién resaltar en la imagen compartida: "" = todos parejo (la típica, para mandar al grupo);
  // un id de vendedor = ese queda a todo color y el resto atenuado (para mandarle a uno solo).
  const [resaltarEnCompartir, setResaltarEnCompartir] = useState("");
  // Menú "Compartir" (imagen + imprimir + a quién resaltar): antes esto vivía repartido en la
  // barra de vistas (Mes/Semana/Día mezclado con exportar), ahora es su propio botón con un
  // panel desplegable, como el share sheet de cualquier app — se cierra solo al clickear afuera.
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const compartirMenuRef = useRef(null);
  useEffect(() => {
    if (!compartirAbierto) return;
    const onClickFuera = (e) => {
      if (compartirMenuRef.current && !compartirMenuRef.current.contains(e.target)) {
        setCompartirAbierto(false);
      }
    };
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [compartirAbierto]);
  const toggleDiaParaCopiar = (fecha) => {
    const key = dateKey(fecha.year, fecha.month, fecha.day);
    setDiasParaCopiar((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const [vista, setVista] = useState("mes"); // "mes" | "semana" | "dia"
  const [semanaInicio, setSemanaInicio] = useState(() => lunesDeLaSemana(now));
  const [tema, setTema] = useState(() => {
    try {
      const t = localStorage.getItem(TEMA_KEY);
      if (t === "light" || t === "dark") return t;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (e) {}
    return "light";
  });
  const [mesVista, setMesVista] = useState(() => {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      const p = raw ? JSON.parse(raw) : null;
      if (p && p.year && p.month) return { year: p.year, month: p.month };
    } catch (e) {}
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const dbDocRef = useRef(null);
  const lastWrittenRef = useRef(null);
  const saveTimer = useRef(null);
  const initedRef = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(TEMA_KEY, tema); } catch (e) {}
    try { document.body.style.background = tema === "dark" ? "#14181A" : "#EDF1F0"; } catch (e) {}
  }, [tema]);

  // Atajo de teclado Ctrl+Z / Cmd+Z para "Deshacer". Si el foco está en un input/textarea/select
  // lo dejamos pasar (que gane el deshacer nativo del navegador para ese campo de texto puntual);
  // en cualquier otro caso (borraste un vendedor, un turno, etc.) dispara nuestro deshacer.
  const deshacerRef = useRef(() => {});
  useEffect(() => { deshacerRef.current = deshacer; });
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      deshacerRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Carga inicial: intenta la capacidad "db" (compartida entre dispositivos); si no está
  // disponible, usa localStorage (solo este dispositivo).
  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    const cargarLocalStorage = () => {
      setSyncMode("local");
      let inicial = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) inicial = migrarDatos(JSON.parse(raw));
      } catch (e) {}
      if (!inicial) inicial = defaultSharedData();
      lastWrittenRef.current = JSON.stringify(inicial);
      setSharedData(inicial);
      setLoaded(true);
    };

    (async () => {
      let db = null;
      try {
        if (typeof window !== "undefined" && window.claude && window.claude.use) {
          db = await window.claude.use("db");
        }
      } catch (e) {
        db = null;
      }
      if (cancelled) return;

      if (!db) {
        cargarLocalStorage();
        return;
      }

      setSyncMode("db");
      const ref = db.doc(DB_DOC_PATH);
      dbDocRef.current = ref;
      unsub = ref.onSnapshot(
        (snap) => {
          if (cancelled) return;
          let actual;
          if (snap.exists) {
            actual = migrarDatos(snap.data());
          } else {
            actual = defaultSharedData();
            ref.set(actual).catch(() => {});
          }
          lastWrittenRef.current = JSON.stringify(actual);
          setSharedData(actual);
          setLoaded(true);
        },
        () => {
          // La suscripción murió (revocado, o el puente dejó de responder): seguimos
          // funcionando localmente para no perder la app por un problema de red.
          if (!cancelled) cargarLocalStorage();
        }
      );
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Guardado (debounced): solo escribe si el contenido cambió respecto de lo último
  // que guardamos o recibimos, para no generar un ida-y-vuelta con la suscripción.
  useEffect(() => {
    if (!loaded || !sharedData) return;
    const serializado = JSON.stringify(sharedData);
    if (serializado === lastWrittenRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setEstadoGuardado("guardando");
      try {
        if (syncMode === "db" && dbDocRef.current) {
          await dbDocRef.current.set(sharedData);
        } else {
          localStorage.setItem(STORAGE_KEY, serializado);
        }
        // Recién ACÁ se marca como escrito lo que se mandó — si el guardado de abajo tira
        // error, esta línea nunca se ejecuta, "serializado" sigue sin coincidir con lo último
        // escrito, y el reintento automático (o el próximo cambio) vuelve a mandar este mismo
        // dato. Antes esto se marcaba ANTES del try: si el guardado fallaba, el cambio quedaba
        // dado por guardado sin estarlo, y se perdía sin que nadie se enterara.
        lastWrittenRef.current = serializado;
        setEstadoGuardado("guardado");
        setTimeout(() => setEstadoGuardado((e) => (e === "guardado" ? "idle" : e)), 900);
      } catch (e) {
        console.error(e);
        setEstadoGuardado("error");
        // Reintento automático con backoff simple: sin esto, si la persona no vuelve a tocar
        // nada, un guardado que falló se queda sin reintentar para siempre (este efecto solo
        // se dispara cuando cambia sharedData).
        if (retryGuardadoRef.current) clearTimeout(retryGuardadoRef.current);
        retryGuardadoRef.current = setTimeout(() => setReintentoGuardadoTick((t) => t + 1), 5000);
      }
    }, 450);
    return () => clearTimeout(saveTimer.current);
  }, [sharedData, loaded, syncMode, reintentoGuardadoTick]);

  // Si se corta y vuelve la conexión, reintenta enseguida en vez de esperar el backoff de 5s.
  useEffect(() => {
    const onOnline = () => forzarReintentoGuardado();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Primera vez que hay datos: elegir local/vendedor activo (de las preferencias
  // guardadas en este dispositivo, si siguen existiendo).
  useEffect(() => {
    if (!loaded || !sharedData || initedRef.current) return;
    initedRef.current = true;
    let prefs = {};
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw) || {};
    } catch (e) {}
    const loc = sharedData.locales.find((l) => l.id === prefs.localActivoId) || sharedData.locales[0];
    setLocalActivoId(loc.id);
    setVendedorActivo(loc.vendedores.find((v) => v.id === prefs.vendedorActivoId)?.id || loc.vendedores[0]?.id || null);
  }, [loaded, sharedData]);

  // Guarda preferencias de navegación (solo en este dispositivo).
  useEffect(() => {
    if (!initedRef.current) return;
    try {
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
        localActivoId, vendedorActivoId: vendedorActivo, year: mesVista.year, month: mesVista.month,
      }));
    } catch (e) {}
  }, [localActivoId, vendedorActivo, mesVista]);

  if (!loaded || !sharedData || !localActivoId) {
    return (
      <div className="vdhApp" data-theme={tema} style={S.loadingWrap}>
        <style>{CSS}</style>
        <div style={S.loadingDot} />
      </div>
    );
  }

  const local = sharedData.locales.find((l) => l.id === localActivoId) || sharedData.locales[0];
  const { year, month } = mesVista;
  const nDias = daysInMonth(year, month);
  const leadBlanks = firstWeekdayMonFirst(year, month);
  const prefix = monthPrefix(year, month);

  const updateLocal = (patch) => {
    pushUndo({ tipo: "local", localId: local.id, localAnterior: local });
    setSharedData((d) => ({ ...d, locales: d.locales.map((l) => (l.id === local.id ? { ...l, ...patch } : l)) }));
  };

  const updateVendedor = (vid, patch) =>
    updateLocal({ vendedores: local.vendedores.map((v) => (v.id === vid ? { ...v, ...patch } : v)) });

  const toggleDiaCerrado = (wd) => {
    const actuales = local.diasCerrados || [];
    const nuevos = actuales.includes(wd) ? actuales.filter((x) => x !== wd) : [...actuales, wd];
    updateLocal({ diasCerrados: nuevos });
  };

  // Franco fijo semanal de un vendedor. Al activarlo se borran los turnos que ya tuviera
  // cargados en ese día de la semana de HOY en adelante (para que el calendario futuro quede
  // consistente), pero no se toca nada de fechas pasadas — el historial de horas ya trabajadas
  // (usado para el reparto de meses cerrados) queda intacto.
  const toggleFrancoVendedor = (vendedorId, wd) => {
    const v = local.vendedores.find((x) => x.id === vendedorId);
    if (!v) return;
    const actuales = v.francos || [];
    const activando = !actuales.includes(wd);
    const francos = activando ? [...actuales, wd] : actuales.filter((x) => x !== wd);
    let dias = v.dias;
    let turnosBorrados = 0;
    if (activando) {
      const hoy = hoyComoFecha();
      const hoyKey = dateKey(hoy.year, hoy.month, hoy.day);
      dias = { ...v.dias };
      Object.keys(dias).forEach((k) => {
        if (k < hoyKey) return;
        const { year, month, day } = fechaDeKey(k);
        if (new Date(year, month - 1, day).getDay() === wd) { delete dias[k]; turnosBorrados++; }
      });
    }
    updateVendedor(vendedorId, { francos, dias });
    if (activando) {
      mostrarToast(
        `Franco fijo: ${v.nombre || "vendedor"} los ${DIAS_SEMANA_LARGO[wd]}` +
          (turnosBorrados > 0 ? ` · se borraron ${turnosBorrados} turno(s) futuro(s) ese día` : ""),
        { deshacible: true }
      );
    } else {
      mostrarToast(`Se sacó el franco fijo de los ${DIAS_SEMANA_LARGO[wd]}`, { deshacible: true });
    }
  };
  const agregarFechaCerrada = (iso) => {
    if (!iso) return;
    const actuales = local.fechasCerradas || [];
    if (actuales.includes(iso)) return;
    updateLocal({ fechasCerradas: [...actuales, iso].sort() });
  };
  const quitarFechaCerrada = (iso) => {
    updateLocal({ fechasCerradas: (local.fechasCerradas || []).filter((f) => f !== iso) });
  };

  const agregarHorarioEspecial = (wd, inicio, fin) => {
    updateLocal({ horariosEspeciales: { ...(local.horariosEspeciales || {}), [wd]: { inicio, fin } } });
  };
  const quitarHorarioEspecial = (wd) => {
    const horarios = { ...(local.horariosEspeciales || {}) };
    delete horarios[wd];
    updateLocal({ horariosEspeciales: horarios });
  };

  const agregarVacacion = (vendedorId, inicioISO, semanas) => {
    if (!inicioISO) return;
    const v = local.vendedores.find((x) => x.id === vendedorId);
    if (!v) return;
    const finISO = finDeVacaciones(inicioISO, semanas);
    const actuales = v.vacaciones || [];
    const solapa = actuales.some((r) => rangosSeSuperponen(inicioISO, finISO, r.inicio, r.fin));
    if (solapa) {
      mostrarToast(`${v.nombre || "Ese vendedor"} ya tiene vacaciones cargadas que se superponen con esas fechas.`);
      return;
    }
    // De vacaciones no se puede tener horario cargado: se borra cualquier turno ya cargado de
    // ese vendedor dentro del rango, sea del mes que sea (no solo el que se está viendo).
    const dias = { ...v.dias };
    let turnosBorrados = 0;
    Object.keys(dias).forEach((k) => {
      if (k >= inicioISO && k <= finISO) { delete dias[k]; turnosBorrados++; }
    });
    const vacaciones = [...actuales, { id: uid(), inicio: inicioISO, fin: finISO }].sort((a, b) => a.inicio.localeCompare(b.inicio));
    updateVendedor(vendedorId, { dias, vacaciones });
    mostrarToast(
      `Vacaciones cargadas: ${v.nombre || "vendedor"}, ${fmtFechaCorta(inicioISO)} al ${fmtFechaCorta(finISO)}` +
        (turnosBorrados > 0 ? ` · se borraron ${turnosBorrados} día(s) con horario ya cargado` : ""),
      { deshacible: true }
    );
  };
  const quitarVacacion = (vendedorId, vacacionId) => {
    const v = local.vendedores.find((x) => x.id === vendedorId);
    if (!v) return;
    updateVendedor(vendedorId, { vacaciones: (v.vacaciones || []).filter((r) => r.id !== vacacionId) });
    mostrarToast("Vacaciones eliminadas", { deshacible: true });
  };

  const addVendedor = () => {
    const nv = defaultVendedor("", indiceColorLibre(local.vendedores));
    updateLocal({ vendedores: [...local.vendedores, nv] });
    setVendedorActivo(nv.id);
  };
  const removeVendedor = (vid) => {
    const eliminado = local.vendedores.find((v) => v.id === vid);
    const restantes = local.vendedores.filter((v) => v.id !== vid);
    updateLocal({ vendedores: restantes });
    if (vendedorActivo === vid) setVendedorActivo(restantes[0]?.id || null);
    mostrarToast(`Se eliminó a ${eliminado?.nombre || "el vendedor"}`, { deshacible: true });
  };

  const addLocal = () => {
    const nl = defaultLocal("Nuevo local");
    pushUndo({ tipo: "addLocal", localId: nl.id });
    setSharedData((d) => ({ ...d, locales: [...d.locales, nl] }));
    setLocalActivoId(nl.id);
    setVendedorActivo(nl.vendedores[0].id);
    setFechaSeleccionada(null);
  };
  const switchLocal = (l) => {
    setLocalActivoId(l.id);
    setVendedorActivo(l.vendedores[0]?.id || null);
    setFechaSeleccionada(null);
    setDiasParaCopiar(new Set());
  };
  const removeLocal = (lid) => {
    if (sharedData.locales.length <= 1) return;
    const indice = sharedData.locales.findIndex((l) => l.id === lid);
    const localAnterior = sharedData.locales[indice];
    const locales = sharedData.locales.filter((l) => l.id !== lid);
    pushUndo({ tipo: "removeLocal", localAnterior, indice });
    setSharedData((d) => ({ ...d, locales }));
    if (localActivoId === lid) {
      setLocalActivoId(locales[0].id);
      setVendedorActivo(locales[0].vendedores[0]?.id || null);
    }
    setFechaSeleccionada(null);
    mostrarToast(`Se eliminó el local "${localAnterior.nombre || "Local"}"`, { deshacible: true });
  };

  const cambiarMes = (delta) => {
    setMesVista((mv) => {
      let m = mv.month + delta, y = mv.year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { year: y, month: m };
    });
  };

  const cambiarVista = (nueva) => {
    if (nueva === vista) return;
    if (nueva === "mes") {
      const base = fechaSeleccionada || { year: mesVista.year, month: mesVista.month, day: 1 };
      setMesVista({ year: base.year, month: base.month });
    } else {
      const base = fechaSeleccionada
        ? new Date(fechaSeleccionada.year, fechaSeleccionada.month - 1, fechaSeleccionada.day)
        : new Date(mesVista.year, mesVista.month - 1, 1);
      setSemanaInicio(lunesDeLaSemana(base));
    }
    setVista(nueva);
  };

  const navPrev = () => {
    if (vista === "mes") cambiarMes(-1);
    else if (vista === "semana") setSemanaInicio((s) => sumarDias(s, -7));
    else {
      const base = fechaSeleccionada || hoyComoFecha();
      const d = sumarDias(new Date(base.year, base.month - 1, base.day), -1);
      setFechaSeleccionada({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
    }
  };
  const navNext = () => {
    if (vista === "mes") cambiarMes(1);
    else if (vista === "semana") setSemanaInicio((s) => sumarDias(s, 7));
    else {
      const base = fechaSeleccionada || hoyComoFecha();
      const d = sumarDias(new Date(base.year, base.month - 1, base.day), 1);
      setFechaSeleccionada({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
    }
  };
  const irAHoy = () => {
    const t = new Date();
    setMesVista({ year: t.getFullYear(), month: t.getMonth() + 1 });
    setSemanaInicio(lunesDeLaSemana(t));
    setFechaSeleccionada({ year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate() });
  };

  const setTurnosDia = (v, fecha, turnos) => {
    const key = dateKey(fecha.year, fecha.month, fecha.day);
    updateVendedor(v.id, { dias: { ...v.dias, [key]: { turnos } } });
  };

  const quitarDiaVendedor = (v, fecha) => {
    const key = dateKey(fecha.year, fecha.month, fecha.day);
    const dias = { ...v.dias };
    delete dias[key];
    updateVendedor(v.id, { dias });
  };

  // Copiar/pegar uno o varios días: junta los turnos de TODOS los vendedores del local en cada
  // fecha elegida (guardado en memoria, no se persiste) y los pega en otro lado, reemplazando lo
  // que esos mismos vendedores ya tuvieran cargado en el día correspondiente. A los vendedores
  // que no trabajaban un día copiado no se los toca. Si se copian varios días, se guarda la
  // distancia en días de cada uno respecto del más antiguo, para poder "pegarlos" manteniendo la
  // misma separación entre ellos a partir de la fecha donde se pegue (ej. copiás lunes+viernes,
  // se pegan igual de separados en la semana que elijas).
  const copiarDias = (fechas) => {
    if (!fechas || fechas.length === 0) return;
    const ordenadas = [...fechas].sort(
      (a, b) => new Date(a.year, a.month - 1, a.day) - new Date(b.year, b.month - 1, b.day)
    );
    const base = new Date(ordenadas[0].year, ordenadas[0].month - 1, ordenadas[0].day);
    const dias = ordenadas.map((f) => {
      const key = dateKey(f.year, f.month, f.day);
      const offsetDias = Math.round((new Date(f.year, f.month - 1, f.day) - base) / 86400000);
      const porVendedor = {};
      local.vendedores.forEach((v) => {
        const turnos = v.dias[key]?.turnos;
        if (turnos && turnos.length) porVendedor[v.id] = turnos.map((t) => ({ ...t }));
      });
      return { offsetDias, porVendedor };
    });
    setDiaCopiado({ localId: local.id, dias });
    mostrarToast(dias.length === 1 ? "Día copiado" : `${dias.length} días copiados`);
  };

  const pegarDias = (fecha) => {
    if (!diaCopiado || diaCopiado.localId !== local.id || !fecha) {
      mostrarToast("No hay nada copiado para pegar");
      return 0;
    }
    const anchor = new Date(fecha.year, fecha.month - 1, fecha.day);
    const porDia = diaCopiado.dias
      .map(({ offsetDias, porVendedor }) => {
        const destino = new Date(anchor);
        destino.setDate(destino.getDate() + offsetDias);
        const key = dateKey(destino.getFullYear(), destino.getMonth() + 1, destino.getDate());
        const entradas = Object.entries(porVendedor).filter(([vid]) => local.vendedores.some((v) => v.id === vid));
        return { key, entradas };
      })
      .filter((d) => d.entradas.length > 0);
    if (porDia.length === 0) {
      mostrarToast("No hay nada para pegar en esa fecha");
      return 0;
    }

    pushUndo({ tipo: "local", localId: local.id, localAnterior: local });
    setSharedData((d) => ({
      ...d,
      locales: d.locales.map((l) => {
        if (l.id !== local.id) return l;
        return {
          ...l,
          vendedores: l.vendedores.map((v) => {
            const propias = porDia.filter(({ entradas }) => entradas.some(([vid]) => vid === v.id));
            if (propias.length === 0) return v;
            const dias = { ...v.dias };
            propias.forEach(({ key, entradas }) => {
              const [, turnos] = entradas.find(([vid]) => vid === v.id);
              dias[key] = { turnos: turnos.map((t) => ({ ...t })) };
            });
            return { ...v, dias };
          }),
        };
      }),
    }));
    mostrarToast(porDia.length === 1 ? "Se pegó 1 día" : `Se pegaron ${porDia.length} días`, { deshacible: true });
    return porDia.length; // cantidad de días efectivamente pegados
  };

  const copiarMesAnteriorVendedor = (v) => {
    let pm = month - 1, py = year;
    if (pm < 1) { pm = 12; py -= 1; }
    const prevPrefix = monthPrefix(py, pm);
    const dias = { ...v.dias };
    let copiados = 0;
    Object.entries(v.dias).forEach(([k, diaObj]) => {
      if (!k.startsWith(prevPrefix)) return;
      const diaNum = Number(k.slice(-2));
      if (diaNum < 1 || diaNum > nDias) return;
      const nuevaKey = dateKey(year, month, diaNum);
      // No pisa días que ya cargaste este mes, ni días de vacaciones o franco fijo (bloqueados).
      if (dias[nuevaKey] !== undefined) return;
      if (estaDeVacaciones(v, year, month, diaNum) || esFrancoVendedor(v, year, month, diaNum)) return;
      dias[nuevaKey] = { turnos: (diaObj.turnos || []).map((t) => ({ ...t })) };
      copiados++;
    });
    if (copiados > 0) updateVendedor(v.id, { dias });
    mostrarToast(
      copiados > 0 ? `Se copiaron ${copiados} días del mes anterior` : "No hay días el mes pasado para copiar",
      { deshacible: copiados > 0 }
    );
    return copiados;
  };

  // Toma el patrón de la primera semana del mes (días 1 a 7) y lo repite, por día de
  // semana, en el resto del mes — sin pisar días que ya tengan algo cargado.
  const repetirSemanaVendedor = (v) => {
    const patronPorDiaSemana = {};
    for (let d = 1; d <= Math.min(7, nDias); d++) {
      const key = dateKey(year, month, d);
      if (v.dias[key]) patronPorDiaSemana[new Date(year, month - 1, d).getDay()] = v.dias[key];
    }
    if (Object.keys(patronPorDiaSemana).length === 0) return 0;
    const dias = { ...v.dias };
    let copiados = 0;
    for (let d = 8; d <= nDias; d++) {
      const key = dateKey(year, month, d);
      if (dias[key] !== undefined) continue;
      if (estaDeVacaciones(v, year, month, d) || esFrancoVendedor(v, year, month, d)) continue;
      const wd = new Date(year, month - 1, d).getDay();
      const patron = patronPorDiaSemana[wd];
      if (patron) {
        dias[key] = { turnos: (patron.turnos || []).map((t) => ({ ...t })) };
        copiados++;
      }
    }
    if (copiados > 0) updateVendedor(v.id, { dias });
    mostrarToast(
      copiados > 0 ? `Se repitieron ${copiados} días según la primera semana` : "Cargá al menos un día en la primera semana (1 al 7) para repetir",
      { deshacible: copiados > 0 }
    );
    return copiados;
  };

  // Copia la semana (real, lunes a domingo) inmediatamente anterior a `semanaInicio` — la que
  // se está viendo en la vista Semana/Día — sin pisar días que ya tengan algo cargado. A
  // diferencia de "repetir 1ª semana", funciona desde cualquier semana y cruza meses sin problema.
  const copiarSemanaAnteriorVendedor = (v) => {
    const dias = { ...v.dias };
    let copiados = 0;
    for (let i = 0; i < 7; i++) {
      const actual = sumarDias(semanaInicio, i);
      const anterior = sumarDias(semanaInicio, i - 7);
      const keyActual = dateKey(actual.getFullYear(), actual.getMonth() + 1, actual.getDate());
      const keyAnterior = dateKey(anterior.getFullYear(), anterior.getMonth() + 1, anterior.getDate());
      if (dias[keyActual] !== undefined) continue;
      if (estaDeVacaciones(v, actual.getFullYear(), actual.getMonth() + 1, actual.getDate()) || esFrancoVendedor(v, actual.getFullYear(), actual.getMonth() + 1, actual.getDate())) continue;
      const origen = v.dias[keyAnterior];
      if (origen && origen.turnos && origen.turnos.length) {
        dias[keyActual] = { turnos: origen.turnos.map((t) => ({ ...t })) };
        copiados++;
      }
    }
    if (copiados > 0) updateVendedor(v.id, { dias });
    mostrarToast(
      copiados > 0 ? `Se copiaron ${copiados} días de la semana anterior` : "No hay datos la semana anterior para copiar",
      { deshacible: copiados > 0 }
    );
    return copiados;
  };

  const resetMes = () => {
    if (!window.confirm(`¿Reiniciar ${MESES[month - 1]} en "${local.nombre || "este local"}"? Se van a borrar los horarios cargados de todos los vendedores de ESTE local ese mes (los demás locales no se tocan; después lo podés deshacer con Ctrl+Z si te arrepentís).`)) {
      return;
    }
    updateLocal({
      vendedores: local.vendedores.map((v) => {
        const dias = { ...v.dias };
        Object.keys(dias).forEach((k) => {
          if (k.startsWith(prefix)) delete dias[k];
        });
        return { ...v, dias };
      }),
    });
    mostrarToast(`Se reinició ${MESES[month - 1]}`, { deshacible: true });
    setFechaSeleccionada(null);
  };

  // Cálculos
  function horasDeVendedor(v) {
    return Object.entries(v.dias)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((s, [, diaObj]) => s + horasDelDia(diaObj), 0);
  }

  // El 100% se reparte según las horas reales trabajadas entre TODOS los vendedores
  // (no según las horas que abre el local), porque puede haber varios vendedores
  // cubriendo el mismo horario a la vez.
  const horasTotalesVendedores = local.vendedores.reduce((s, v) => s + horasDeVendedor(v), 0);

  const filas = local.vendedores.map((v) => {
    const horas = horasDeVendedor(v);
    const pct = horasTotalesVendedores > 0 ? (horas / horasTotalesVendedores) * 100 : 0;
    const monto = (pct / 100) * (Number(local.objetivoTotal) || 0);
    return { ...v, horas, pct, monto };
  });

  // Vacaciones de todos los vendedores del local, en una sola lista ordenada por fecha (para el
  // listado de chips en "Configuración del local" — a diferencia de feriados/horarios especiales,
  // acá hay que mostrar de qué vendedor es cada rango).
  const todasVacaciones = local.vendedores
    .flatMap((v) => (v.vacaciones || []).map((r) => ({ ...r, vendedorId: v.id, vendedorNombre: v.nombre, vendedorColor: v.color })))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  // Francos fijos de todos los vendedores del local, aplanados para el listado de chips (un
  // chip por combinación vendedor+día, para poder sacar uno solo sin afectar el resto).
  const todosFrancos = local.vendedores
    .flatMap((v) => (v.francos || []).map((wd) => ({ id: `${v.id}-${wd}`, vendedorId: v.id, vendedorNombre: v.nombre, vendedorColor: v.color, wd })))
    .sort((a, b) => a.wd - b.wd || (a.vendedorNombre || "").localeCompare(b.vendedorNombre || ""));
  const pctTotal = filas.reduce((s, f) => s + f.pct, 0);
  const montoTotal = filas.reduce((s, f) => s + f.monto, 0);

  const vActivo = local.vendedores.find((v) => v.id === vendedorActivo) || local.vendedores[0];

  const fechaDiaVista = fechaSeleccionada || hoyComoFecha();
  const diasGrilla = vista === "semana"
    ? diasDeLaSemana(semanaInicio)
    : [new Date(fechaDiaVista.year, fechaDiaVista.month - 1, fechaDiaVista.day)];

  // Encabezado que solo se ve al imprimir (ver S.soloImprimir / @media print más abajo): al
  // ocultar el resto de la pantalla para imprimir, se pierde el contexto de local/fecha que
  // daban el header y el navegador de arriba, así que se repite acá adentro de lo que sí queda
  // visible.
  const rangoLabelImpresion = vista === "mes"
    ? `${MESES[mesVista.month - 1]} ${mesVista.year}`
    : vista === "semana"
    ? fmtRangoSemana(semanaInicio)
    : fmtFechaLarga(fechaDiaVista);

  // "Compartir imagen": convierte la tarjeta del calendario en un PNG (con html2canvas) y abre
  // el selector nativo para compartir (WhatsApp, etc.) si el navegador lo permite; si no —la
  // mayoría de las compus—, descarga el PNG para adjuntarlo a mano. Reutiliza las mismas clases
  // "no-imprimir"/"solo-imprimir" del botón Imprimir para mostrar una versión limpia (sin
  // botones ni recortes de alto) mientras saca la foto, y las saca apenas termina.
  const compartirImagen = async () => {
    const el = calendarioRef.current;
    if (!el || !window.html2canvas || generandoImagen) {
      if (!window.html2canvas) alert("No se pudo cargar la herramienta para generar la imagen. Probá de nuevo en unos segundos.");
      return;
    }
    setGenerandoImagen(true);
    el.classList.add("capturando-imagen");
    // Si se eligió resaltar a alguien, sus turnos quedan a todo color y los del resto del equipo
    // atenuados, para mandarle la imagen a esa persona. Por defecto ("Todos") no se atenúa nada,
    // que es lo que sirve para mandar el horario completo al grupo.
    const vendedorResaltado = local.vendedores.find((v) => v.id === resaltarEnCompartir) || null;
    const estiloResaltado = document.createElement("style");
    if (vendedorResaltado) {
      estiloResaltado.textContent = `.capturando-imagen [data-vendedor-id]:not([data-vendedor-id="${vendedorResaltado.id}"]) { opacity: 0.3 !important; filter: grayscale(70%) !important; }`;
      document.head.appendChild(estiloResaltado);
    }
    const limpiar = () => {
      el.classList.remove("capturando-imagen");
      if (estiloResaltado.parentNode) estiloResaltado.parentNode.removeChild(estiloResaltado);
    };
    try {
      await new Promise((r) => setTimeout(r, 50)); // deja que el navegador aplique los estilos antes de la foto
      const canvas = await window.html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true });
      limpiar();
      const nombre = `Horario ${local.nombre || "local"}${vendedorResaltado ? " - " + (vendedorResaltado.nombre || "vendedor") : ""} - ${rangoLabelImpresion}`
        .replace(/[\\/:*?"<>|]+/g, "").trim() + ".png";
      canvas.toBlob(async (blob) => {
        if (!blob) { setGenerandoImagen(false); return; }
        const file = new File([blob], nombre, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Horario" });
            setGenerandoImagen(false);
            return;
          } catch (e) {
            setGenerandoImagen(false);
            if (e.name === "AbortError") return; // canceló el cartel de compartir, no bajamos nada
          }
        }
        // Sin Web Share con archivos (la mayoría de las compus): se descarga el PNG para
        // adjuntarlo a mano en WhatsApp Web/Escritorio.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setGenerandoImagen(false);
      }, "image/png");
    } catch (e) {
      limpiar();
      setGenerandoImagen(false);
      console.error(e);
      alert("No se pudo generar la imagen. Probá de nuevo.");
    }
  };

  return (
    <div className="vdhApp" data-theme={tema} style={panelesAbiertos ? S.page : { ...S.page, maxWidth: "none" }}>
      <style>{CSS}</style>

      {/* Header: compacto, todo en una fila, para dejarle más lugar al calendario */}
      <div style={S.headerBand}>
        <div style={S.logoRow}>
          <button
            onClick={() => setPanelesAbiertos((a) => !a)}
            style={S.panelToggleBtn}
            title={panelesAbiertos ? "Ocultar los paneles laterales y agrandar el calendario" : "Volver a mostrar los paneles laterales"}
          >
            ☰
          </button>
          <div style={S.logoMark}>VDH</div>
          <div>
            <div style={S.brandTitle}>Planificador VDH</div>
            <div style={S.brandSubtitle}>REPARTO POR VENDEDOR</div>
          </div>
        </div>

        {/* Selector de local (dropdown) */}
        <div className="localDropdownOuter" style={S.localDropdownWrap}>
          <button style={S.localDropdownBtn} onClick={() => setLocalOpen((o) => !o)}>
            <span style={S.localDropdownText}>{local.nombre || "Local"}</span>
            <ChevronDown size={16} color={SUB} style={{ transform: localOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {localOpen && (
            <div style={S.localDropdownList}>
              {sharedData.locales.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { switchLocal(l); setLocalOpen(false); }}
                  style={l.id === local.id ? S.localOptionActive : S.localOption}
                >
                  <Store size={13} />
                  <span>{l.nombre || "Local"}</span>
                </button>
              ))}
              <button
                onClick={() => { addLocal(); setLocalOpen(false); }}
                style={S.localOptionAdd}
              >
                <Plus size={13} /> Agregar local
              </button>
            </div>
          )}
        </div>

        <div style={S.headerRight}>
          <div style={S.headerRightRow}>
            <span style={syncMode === "db" ? S.syncBadgeOn : S.syncBadgeOff}>
              {syncMode === "db" ? "☁ Sincronizado" : "📱 Solo este dispositivo"}
            </span>
            <button
              onClick={deshacer}
              disabled={!hayDeshacer}
              style={hayDeshacer ? S.undoBtn : S.undoBtnDisabled}
              title="Deshacer el último cambio (Ctrl+Z)"
            >
              ↩ Deshacer
            </button>
            <button
              onClick={() => setTema((t) => (t === "dark" ? "light" : "dark"))}
              style={S.temaBtn}
              title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {tema === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
          {estadoGuardado === "error" ? (
            <button
              onClick={forzarReintentoGuardado}
              style={S.errorPill}
              title="Tu último cambio no se pudo guardar. Tocá para reintentar ahora."
            >
              ⚠ {typeof navigator !== "undefined" && navigator.onLine === false ? "Sin conexión" : "No se guardó"} · Reintentar
            </button>
          ) : (
            <div style={{ ...S.savedPill, opacity: estadoGuardado === "idle" ? 0.001 : 1 }}>
              {estadoGuardado === "guardando" ? (
                <span className="dotPulso" />
              ) : (
                <Check size={11} strokeWidth={3} />
              )}
              <span>{estadoGuardado === "guardando" ? "Guardando…" : "Guardado"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Navegador de mes/semana/día */}
      <ViewNav
        vista={vista} mesVista={mesVista} semanaInicio={semanaInicio} fechaSeleccionada={fechaDiaVista}
        onPrev={navPrev} onNext={navNext} onHoy={irAHoy}
      />

      <div className={`appGrid${panelesAbiertos ? "" : " sin-paneles"}`}>
        {/* Columna izquierda: configuración y edición. Se saca del DOM (no se esconde) al plegar,
            si no la grilla le sigue reservando su columna y el calendario no se estira. */}
        {panelesAbiertos && (
        <div className="card-izquierda">
          <div style={S.card}>
            <div style={S.rowBetween}>
              <input
                value={local.nombre}
                onChange={(e) => updateLocal({ nombre: e.target.value })}
                style={S.nameInput}
                placeholder="Nombre del local"
              />
              {sharedData.locales.length > 1 && (
                <button onClick={() => removeLocal(local.id)} style={S.iconGhost}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <label style={S.field}>
              <span style={S.label}>Objetivo del mes</span>
              <MoneyInput
                value={local.objetivoTotal}
                onChange={(n) => updateLocal({ objetivoTotal: n })}
                style={S.input}
                placeholder="Opcional"
              />
            </label>

            {/* Cosas que se configuran una vez y casi no se tocan: quedan plegadas para no
                ocuparle lugar todos los días a lo que sí se usa seguido (vendedores, calendario). */}
            <button
              onClick={() => setConfigAbierta((o) => !o)}
              style={S.configToggleBtn}
              aria-expanded={configAbierta}
            >
              <span>Configuración del local</span>
              <ChevronDown
                size={15}
                style={{ transform: configAbierta ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </button>

            {configAbierta && (
              <div className="acordeonContenido">
                <div style={{ ...S.twoCol, marginTop: 10 }}>
                  <label style={S.field}>
                    <span style={S.label}>Local abre desde</span>
                    <select
                      value={local.horaInicio}
                      onChange={(e) => updateLocal({ horaInicio: e.target.value })}
                      style={S.input}
                    >
                      {generarOpcionesHora("00:00", "23:30").map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                  <label style={S.field}>
                    <span style={S.label}>Hasta</span>
                    <select
                      value={local.horaFin}
                      onChange={(e) => updateLocal({ horaFin: e.target.value })}
                      style={S.input}
                    >
                      {generarOpcionesHora("00:00", "23:30").map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={S.cerradosBlock}>
                  <span style={S.label}>Días cerrados fijos</span>
                  <div style={S.cerradosChipRow}>
                    {DIAS_SEMANA.map((w, i) => {
                      const wd = JS_WEEKDAY_DE_INDICE[i];
                      const activo = (local.diasCerrados || []).includes(wd);
                      return (
                        <button
                          key={i}
                          onClick={() => toggleDiaCerrado(wd)}
                          style={activo ? S.cerradoChipActivo : S.cerradoChip}
                        >{w}</button>
                      );
                    })}
                  </div>

                  <span style={{ ...S.label, marginTop: 10, display: "block" }}>Horarios especiales (ej. domingos de 10 a 21)</span>
                  {Object.keys(local.horariosEspeciales || {}).length > 0 && (
                    <div style={S.feriadoList}>
                      {Object.entries(local.horariosEspeciales).sort(([a], [b]) => a - b).map(([wd, h]) => (
                        <span key={wd} style={S.feriadoChip}>
                          {DIAS_SEMANA_LARGO[wd]} {h.inicio}–{h.fin}
                          <button onClick={() => quitarHorarioEspecial(wd)} style={S.feriadoRemove}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <HorarioEspecialPicker local={local} onAgregar={agregarHorarioEspecial} />

                  <span style={{ ...S.label, marginTop: 10, display: "block" }}>Feriados / fechas puntuales cerradas</span>
                  <FeriadoPicker onAgregar={agregarFechaCerrada} />
                  {(local.fechasCerradas || []).length > 0 && (
                    <div style={S.feriadoList}>
                      {[...(local.fechasCerradas || [])].sort().map((f) => (
                        <span key={f} style={S.feriadoChip}>
                          {fmtFechaCorta(f)}
                          <button onClick={() => quitarFechaCerrada(f)} style={S.feriadoRemove}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={S.cerradosBlock}>
                  <span style={S.label}>Vacaciones de vendedores</span>
                  <VacacionesPicker local={local} onAgregar={agregarVacacion} />
                  {todasVacaciones.length > 0 && (
                    <div style={S.feriadoList}>
                      {todasVacaciones.map((r) => (
                        <span key={r.id} style={S.feriadoChip}>
                          <span style={{ ...S.chipDot, background: r.vendedorColor }} />
                          {r.vendedorNombre || "Sin nombre"}: {fmtFechaCorta(r.inicio)}–{fmtFechaCorta(r.fin)}
                          <button onClick={() => quitarVacacion(r.vendedorId, r.id)} style={S.feriadoRemove}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={S.cerradosBlock}>
                  <span style={S.label}>Franco fijo de vendedores</span>
                  <FrancoPicker local={local} onToggle={toggleFrancoVendedor} />
                  {todosFrancos.length > 0 && (
                    <div style={S.feriadoList}>
                      {todosFrancos.map((f) => (
                        <span key={f.id} style={S.feriadoChip}>
                          <span style={{ ...S.chipDot, background: f.vendedorColor }} />
                          {f.vendedorNombre || "Sin nombre"}: {DIAS_SEMANA_LARGO[f.wd]}
                          <button onClick={() => toggleFrancoVendedor(f.vendedorId, f.wd)} style={S.feriadoRemove}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.rowBetween}>
              <div style={S.sectionTitle}>Vendedores</div>
              <button onClick={addVendedor} style={S.addBtn}>
                <Plus size={13} /> Agregar
              </button>
            </div>

            <div style={S.chipRow}>
              {local.vendedores.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVendedorActivo(v.id)}
                  style={v.id === vActivo?.id ? { ...S.chipActiveAccent, background: v.color, color: colorTextoContraste(v.color) } : S.chip}
                >
                  <span style={{ ...S.chipDot, background: v.color }} />
                  {v.nombre || "Sin nombre"}
                </button>
              ))}
            </div>

            {vActivo && (
              <VendedorEditor
                key={vActivo.id}
                v={vActivo}
                prefix={prefix}
                onChange={(patch) => updateVendedor(vActivo.id, patch)}
                onCopiarMesAnterior={() => copiarMesAnteriorVendedor(vActivo)}
                onRepetirSemana={() => repetirSemanaVendedor(vActivo)}
                onCopiarSemanaAnterior={() => copiarSemanaAnteriorVendedor(vActivo)}
                onRemove={() => removeVendedor(vActivo.id)}
                canRemove={local.vendedores.length > 1}
                horasCalc={horasDeVendedor(vActivo)}
              />
            )}
          </div>
        </div>
        )}

        {/* Columna central: calendario, grande */}
        <div className="card-calendario" ref={calendarioRef}>
          <div style={S.card}>
            {/* Este bloque y las clases "no-imprimir"/"solo-imprimir" de acá abajo se usan tanto
                para Imprimir (@media print) como para "Compartir imagen" (clase .capturando-imagen
                agregada a mano un instante antes de sacar la foto): en los dos casos se oculta el
                resto de la pantalla y se repite acá el contexto (local y fecha). */}
            <div className="solo-imprimir" style={S.encabezadoImpresion}>
              <div style={S.sectionTitle}>{local.nombre || "Local"}</div>
              <div style={S.miniStat}>{rangoLabelImpresion}</div>
            </div>
            <div style={S.rowBetween}>
              <div className="no-imprimir">
                <div style={S.sectionTitle}>Calendario de horarios</div>
                <div style={S.miniStat}>
                  {vista === "mes" ? "Tocá un día para cargar el horario del vendedor seleccionado" : "Tocá un turno para editarlo, o el espacio vacío para elegir el día"}
                  {" · Ctrl+clic (o Cmd+clic) en varios días para copiarlos juntos"}
                </div>
              </div>
              <div className="no-imprimir" style={S.vistaSwitchRow}>
                <button onClick={() => cambiarVista("mes")} style={vista === "mes" ? S.vistaBtnActive : S.vistaBtn}>Mes</button>
                <button onClick={() => cambiarVista("semana")} style={vista === "semana" ? S.vistaBtnActive : S.vistaBtn}>Semana</button>
                <button onClick={() => cambiarVista("dia")} style={vista === "dia" ? S.vistaBtnActive : S.vistaBtn}>Día</button>
                <div ref={compartirMenuRef} style={S.compartirMenuWrap}>
                  <button
                    onClick={() => setCompartirAbierto((o) => !o)}
                    style={compartirAbierto ? S.vistaBtnActive : S.vistaBtn}
                    title="Compartir imagen o imprimir este calendario"
                    aria-expanded={compartirAbierto}
                    aria-haspopup="true"
                  >
                    <Share2 size={13} />
                  </button>
                  {compartirAbierto && (
                    <div style={S.compartirMenuPanel}>
                      <div style={S.compartirMenuTitulo}>Compartir</div>
                      <label style={S.compartirMenuLabel}>
                        Resaltar a
                        <select
                          value={resaltarEnCompartir}
                          onChange={(e) => setResaltarEnCompartir(e.target.value)}
                          style={S.compartirMenuSelect}
                        >
                          <option value="">Todos parejo</option>
                          {local.vendedores.map((v) => (
                            <option key={v.id} value={v.id}>{v.nombre || "Sin nombre"}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => { compartirImagen(); setCompartirAbierto(false); }}
                        disabled={generandoImagen}
                        style={S.compartirMenuBtn}
                      >
                        <Share2 size={13} /> {generandoImagen ? "Generando…" : "Compartir imagen"}
                      </button>
                      <button
                        onClick={() => { setCompartirAbierto(false); setTimeout(() => window.print(), 50); }}
                        style={S.compartirMenuBtn}
                      >
                        <Printer size={13} /> Imprimir / Guardar PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {vista === "mes" ? (
                <SharedCalendar
                  year={year} month={month} nDias={nDias} leadBlanks={leadBlanks} prefix={prefix}
                  vendedores={local.vendedores}
                  local={local}
                  fechaSeleccionada={fechaSeleccionada}
                  onSelectFecha={setFechaSeleccionada}
                  diasParaCopiar={diasParaCopiar}
                  onToggleDiaParaCopiar={toggleDiaParaCopiar}
                />
              ) : (
                <GrillaSemana
                  dias={diasGrilla}
                  vendedores={local.vendedores}
                  local={local}
                  fechaSeleccionada={fechaSeleccionada}
                  onSelectFecha={setFechaSeleccionada}
                  onSelectVendedor={setVendedorActivo}
                  diasParaCopiar={diasParaCopiar}
                  onToggleDiaParaCopiar={toggleDiaParaCopiar}
                />
              )}
            </div>
            <div style={S.legendRow}>
              {local.vendedores.map((v) => (
                <span key={v.id} data-vendedor-id={v.id} style={S.legendChip}>
                  <span style={{ ...S.legendDot, background: v.color }} />
                  {v.nombre || "Sin nombre"}
                </span>
              ))}
              {/* No le sirven a un vendedor que recibe la imagen/PDF, son datos para el local. */}
              <span className="no-imprimir" style={S.legendChip}>
                <span style={S.gapDot} />
                Hueco sin cubrir
              </span>
              <span className="no-imprimir" style={S.legendChip}>
                <span style={S.feriadoDot} />
                Feriado nacional
              </span>
            </div>
          </div>
        </div>

        {/* Columna derecha: horario del día seleccionado + reparto del mes (se pliega con el ☰) */}
        {panelesAbiertos && (
        <div className="card-derecha">
          <TurnoEditorCard
            vendedor={vActivo}
            vendedores={local.vendedores}
            local={local}
            fecha={fechaSeleccionada}
            onCambiarFecha={setFechaSeleccionada}
            onSetTurnos={(turnos) => setTurnosDia(vActivo, fechaSeleccionada, turnos)}
            onQuitarDia={() => quitarDiaVendedor(vActivo, fechaSeleccionada)}
            copiaDisponible={
              diaCopiado && diaCopiado.localId === local.id
                ? { cantidadDias: diaCopiado.dias.length }
                : null
            }
            diasSeleccionadosParaCopiar={diasParaCopiar.size}
            onCopiarDia={() => {
              const fechas = diasParaCopiar.size > 0
                ? [...diasParaCopiar].map(fechaDeKey)
                : (fechaSeleccionada ? [fechaSeleccionada] : []);
              copiarDias(fechas);
              setDiasParaCopiar(new Set());
            }}
            onLimpiarSeleccion={() => setDiasParaCopiar(new Set())}
            onPegarDia={() => pegarDias(fechaSeleccionada)}
          />

          <div style={S.card}>
            <div style={S.rowBetween}>
              <div>
                <div style={S.eyebrowLine}>// REPARTO DEL MES</div>
                <div style={S.sectionTitle}>{MESES[month - 1]}</div>
              </div>
              <button onClick={resetMes} style={S.smallGhostBtn}>Reiniciar mes</button>
            </div>

            <div style={S.rankList}>
              {[...filas]
                .sort((a, b) => b.pct - a.pct)
                .map((f, i) => (
                  <div key={f.id} className="rankFila" style={i === 0 ? S.rankCardTop : S.rankCard}>
                    <div style={S.rankBadge}>
                      <span style={{ ...S.rankDot, background: f.color }} />
                    </div>
                    <div style={S.rankInfo}>
                      <div style={S.rankName}>{f.nombre || "Sin nombre"}</div>
                      <div style={S.rankSub}>{fmt(f.horas, 1)} hs este mes</div>
                    </div>
                    <div style={S.rankRight}>
                      <div style={S.rankPct}>{fmt(f.pct, 1)}%</div>
                      {local.objetivoTotal > 0 && (
                        <div style={S.rankMoney}>{fmtMoney(f.monto)}</div>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <div style={S.rowBetween2}>
              <span style={S.miniStat}>Total repartido</span>
              <span style={S.miniStatStrong}>
                {fmt(pctTotal, 1)}%{local.objetivoTotal > 0 && ` · ${fmtMoney(montoTotal)}`}
              </span>
            </div>

            {horasTotalesVendedores === 0 && (
              <div style={S.note}>Marcá los horarios trabajados de al menos un vendedor para ver el reparto.</div>
            )}
          </div>
        </div>
        )}
      </div>

      {toast && (
        <div className="toast no-imprimir" role="status">
          <span>{toast.mensaje}</span>
          {toast.deshacible && (
            <button onClick={deshacerDesdeToast} className="toastDeshacer" style={S.toastDeshacerBtn}>Deshacer</button>
          )}
          <button onClick={() => setToast(null)} style={S.toastCerrarBtn} title="Cerrar" aria-label="Cerrar aviso">×</button>
        </div>
      )}
    </div>
  );
}

function ViewNav({ vista, mesVista, semanaInicio, fechaSeleccionada, onPrev, onNext, onHoy }) {
  let label;
  if (vista === "mes") label = `${MESES[mesVista.month - 1]} ${mesVista.year}`;
  else if (vista === "semana") label = fmtRangoSemana(semanaInicio);
  else label = fmtFechaLarga(fechaSeleccionada);
  return (
    <div style={S.monthNav}>
      <button onClick={onPrev} style={S.navBtn}><ChevronLeft size={16} /></button>
      <span style={S.monthLabel}>{label}</span>
      <button onClick={onNext} style={S.navBtn}><ChevronRight size={16} /></button>
      <button onClick={onHoy} style={S.hoyBtn}>Hoy</button>
    </div>
  );
}

function FeriadoPicker({ onAgregar }) {
  const [valor, setValor] = useState("");
  return (
    <div style={S.feriadoPickerRow}>
      <input
        type="date"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        style={S.input}
      />
      <button
        onClick={() => { if (valor) { onAgregar(valor); setValor(""); } }}
        style={S.copyBtn}
      >Agregar</button>
    </div>
  );
}

// Para cargar, ej., "los domingos abrimos de 10 a 21" en vez del horario general del local.
// Solo ofrece días que todavía no tengan un horario especial cargado (para cambiar uno ya
// cargado, primero se lo saca con la × y se vuelve a agregar).
function HorarioEspecialPicker({ local, onAgregar }) {
  const diasDisponibles = [0, 1, 2, 3, 4, 5, 6].filter((wd) => !(local.horariosEspeciales || {})[wd]);
  const [dia, setDia] = useState(diasDisponibles[0]);
  const [inicio, setInicio] = useState(local.horaInicio || "08:00");
  const [fin, setFin] = useState(local.horaFin || "22:00");
  const opciones = generarOpcionesHora("00:00", "23:30");

  if (diasDisponibles.length === 0) return null; // ya hay uno cargado para los 7 días

  const diaActual = diasDisponibles.includes(dia) ? dia : diasDisponibles[0];

  return (
    <div style={{ marginTop: 6 }}>
      <select value={diaActual} onChange={(e) => setDia(Number(e.target.value))} style={{ ...S.input, marginBottom: 6 }}>
        {diasDisponibles.map((wd) => (
          <option key={wd} value={wd}>{DIAS_SEMANA_LARGO[wd]}</option>
        ))}
      </select>
      <div style={S.twoCol}>
        <select value={inicio} onChange={(e) => setInicio(e.target.value)} style={S.input}>
          {opciones.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select value={fin} onChange={(e) => setFin(e.target.value)} style={S.input}>
          {opciones.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
      <button
        onClick={() => onAgregar(diaActual, inicio, fin)}
        style={{ ...S.copyBtn, marginTop: 6 }}
      >+ Agregar horario especial</button>
    </div>
  );
}

// Para cargar "Fulano se toma 2 semanas desde el 10/11": elige vendedor + fecha de inicio +
// cantidad de semanas, y muestra en vivo hasta qué fecha (inclusive) queda de vacaciones.
function VacacionesPicker({ local, onAgregar }) {
  const vendedores = local.vendedores;
  const [vendedorId, setVendedorId] = useState(vendedores[0]?.id || "");
  const [inicio, setInicio] = useState("");
  const [semanas, setSemanas] = useState(1);

  if (vendedores.length === 0) return null;

  const vendedorIdActual = vendedores.some((v) => v.id === vendedorId) ? vendedorId : vendedores[0].id;
  const fin = inicio ? finDeVacaciones(inicio, semanas) : null;

  return (
    <div style={{ marginTop: 6 }}>
      <select value={vendedorIdActual} onChange={(e) => setVendedorId(e.target.value)} style={{ ...S.input, marginBottom: 6 }}>
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>{v.nombre || "Sin nombre"}</option>
        ))}
      </select>
      <div style={S.twoCol}>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={S.input} />
        <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} style={S.input}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} semana{n > 1 ? "s" : ""}</option>
          ))}
        </select>
      </div>
      {fin && <div style={{ ...S.notePlainSinMargen, marginTop: 6 }}>Hasta el {fmtFechaCorta(fin)} (inclusive)</div>}
      <button
        onClick={() => {
          if (!inicio) return;
          onAgregar(vendedorIdActual, inicio, semanas);
          setInicio("");
          setSemanas(1);
        }}
        style={{ ...S.copyBtn, marginTop: 6 }}
      >+ Agregar vacaciones</button>
    </div>
  );
}

// Franco fijo: elegí el vendedor y togglear los días de la semana que libra siempre — mismo
// formato de chips que "Días cerrados fijos" del local, pero por vendedor.
function FrancoPicker({ local, onToggle }) {
  const vendedores = local.vendedores;
  const [vendedorId, setVendedorId] = useState(vendedores[0]?.id || "");

  if (vendedores.length === 0) return null;

  const vendedorIdActual = vendedores.some((v) => v.id === vendedorId) ? vendedorId : vendedores[0].id;
  const vendedorActual = vendedores.find((v) => v.id === vendedorIdActual);

  return (
    <div style={{ marginTop: 6 }}>
      <select value={vendedorIdActual} onChange={(e) => setVendedorId(e.target.value)} style={{ ...S.input, marginBottom: 6 }}>
        {vendedores.map((v) => (
          <option key={v.id} value={v.id}>{v.nombre || "Sin nombre"}</option>
        ))}
      </select>
      <div style={S.cerradosChipRow}>
        {DIAS_SEMANA.map((w, i) => {
          const wd = JS_WEEKDAY_DE_INDICE[i];
          const activo = (vendedorActual?.francos || []).includes(wd);
          return (
            <button
              key={i}
              onClick={() => onToggle(vendedorIdActual, wd)}
              style={activo ? S.cerradoChipActivo : S.cerradoChip}
            >{w}</button>
          );
        })}
      </div>
    </div>
  );
}

// Calendario mensual: para TODOS los vendedores del local, un resumen compacto de los turnos
// cargados cada día (nombre + horario, con una tira fina proporcional al horario del local
// debajo). Marca el día actual, los días cerrados (fijos o feriados) y los huecos de cobertura.
function SharedCalendar({ year, month, nDias, leadBlanks, prefix, vendedores, local, fechaSeleccionada, onSelectFecha, diasParaCopiar, onToggleDiaParaCopiar }) {
  const feriados = feriadosArgentina(year);
  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(<div key={"b" + i} />);
  for (let d = 1; d <= nDias; d++) {
    const key = dateKey(year, month, d);
    const cerrado = estaCerrado(local, year, month, d);
    const feriado = feriados[key];
    const entradas = vendedores
      .map((v) => ({ v, dia: v.dias[key] }))
      .filter((x) => x.dia && x.dia.turnos && x.dia.turnos.length > 0);
    const visibles = entradas.slice(0, 4);
    const resto = entradas.length - visibles.length;
    const seleccionado = !!fechaSeleccionada && fechaSeleccionada.year === year && fechaSeleccionada.month === month && fechaSeleccionada.day === d;
    const hoy = esHoy(year, month, d);
    const horarioDia = horarioDelDia(local, year, month, d);
    const tieneHueco = !cerrado && huecosDelDia(vendedores, key, horarioDia.inicio, horarioDia.fin).length > 0;
    // Defensivo: un vendedor de vacaciones no debería tener turnos cargados ese día (se borran al
    // cargar la vacación), pero por las dudas no se duplica si ya está en `entradas`.
    const vacacionesHoy = vendedoresDeVacaciones(vendedores, year, month, d).filter(
      (v) => !entradas.some((e) => e.v.id === v.id)
    );
    const francoHoy = vendedoresDeFranco(vendedores, year, month, d).filter(
      (v) => !entradas.some((e) => e.v.id === v.id) && !vacacionesHoy.some((e) => e.id === v.id)
    );

    let cellStyle = S.dayCell;
    if (seleccionado) cellStyle = S.dayCellSelected;
    else if (cerrado) cellStyle = S.dayCellCerrado;
    else if (hoy) cellStyle = S.dayCellHoy;
    const marcadoParaCopiar = diasParaCopiar && diasParaCopiar.has(key);
    if (marcadoParaCopiar) cellStyle = { ...cellStyle, ...S.diaMarcadoParaCopiar };

    cells.push(
      <button
        key={d}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) onToggleDiaParaCopiar({ year, month, day: d });
          else onSelectFecha({ year, month, day: d });
        }}
        style={cellStyle}
        title={feriado || undefined}
      >
        <span style={cerrado ? S.dayNumRowCerrado : hoy ? S.dayNumRowHoy : S.dayNumRow}>
          {d}
          {feriado && <span style={S.feriadoDot} />}
          {tieneHueco && <span style={S.gapDot} />}
          {marcadoParaCopiar && <span style={S.multicopiaCheck}>✓</span>}
        </span>
        {cerrado && visibles.length === 0 && <span style={S.cerradoLabel}>Cerrado</span>}
        {!cerrado && feriado && visibles.length === 0 && <span style={S.feriadoLabel}>{feriado}</span>}
        {visibles.map(({ v, dia }) => {
          const primerNombre = (v.nombre || "Sin nombre").split(" ")[0];
          return (
            // El nombre va en --ink (no en el color del vendedor): sobre el gris de la celda,
            // varios de los colores de la paleta (flamingo, sage) quedaban por debajo del
            // contraste mínimo legible. El puntito de color alcanza para identificar a quién
            // corresponde cada línea, igual que en la leyenda de abajo del calendario.
            <span
              key={v.id}
              data-vendedor-id={v.id}
              style={S.turnoTextLabel}
              title={`${v.nombre || "Sin nombre"}: ${fmtResumenDia(dia)}`}
            >
              <span style={{ ...S.turnoDot, background: v.color }} />
              <span style={S.turnoTextInner}>{primerNombre} {fmtResumenDia(dia)}</span>
            </span>
          );
        })}
        {resto > 0 && <span style={S.moreBadge}>+{resto} más</span>}
        {vacacionesHoy.map((v) => {
          const primerNombre = (v.nombre || "Sin nombre").split(" ")[0];
          return (
            <span
              key={"vac-" + v.id}
              data-vendedor-id={v.id}
              style={S.turnoTextLabel}
              title={`${v.nombre || "Sin nombre"}: de vacaciones`}
            >
              <span style={{ ...S.turnoDot, background: v.color }} />
              <span style={S.vacacionTextInner}>{primerNombre} de vacaciones</span>
            </span>
          );
        })}
        {francoHoy.map((v) => {
          const primerNombre = (v.nombre || "Sin nombre").split(" ")[0];
          return (
            <span
              key={"franco-" + v.id}
              data-vendedor-id={v.id}
              style={S.turnoTextLabel}
              title={`${v.nombre || "Sin nombre"}: franco`}
            >
              <span style={{ ...S.turnoDot, background: v.color }} />
              <span style={S.francoTextInner}>{primerNombre} franco</span>
            </span>
          );
        })}
      </button>
    );
  }
  return (
    <div>
      <div style={S.weekHeader}>
        {DIAS_SEMANA.map((w, i) => (
          <span key={i} style={S.weekHeaderCell}>{w}</span>
        ))}
      </div>
      <div style={S.grid}>{cells}</div>
    </div>
  );
}

// Vista semana/día: grilla horaria estilo Google Calendar. Cada turno se dibuja en su posición
// y duración reales; si varios vendedores se solapan, se acomodan en columnas lado a lado.
function GrillaSemana({ dias, vendedores, local, fechaSeleccionada, onSelectFecha, onSelectVendedor, diasParaCopiar, onToggleDiaParaCopiar }) {
  const feriadosPorAnio = {};
  const getFeriados = (y) => feriadosPorAnio[y] || (feriadosPorAnio[y] = feriadosArgentina(y));

  const desdeMin = minutosDe(local.horaInicio);
  const hastaMin = minutosDe(local.horaFin);
  const rango = Math.max(60, hastaMin - desdeMin);

  // La altura por hora se achica para que, siempre que entre, el horario completo del local se
  // vea sin scroll vertical (antes era fija en 56px/hora y en locales con muchas horas de
  // apertura la parte de abajo quedaba tapada). Si ni achicando entra —pantallas muy bajas—, el
  // encabezado de días queda fijo arriba y solo hace scroll la grilla de turnos.
  const scrollRef = useRef(null);
  const [pxPorHora, setPxPorHora] = useState(56);
  // Por debajo de los 900px el layout pasa a una sola columna (ver el media query del CSS de
  // más abajo): ahí conviene un ancho mínimo por día con scroll horizontal, para que los turnos
  // no queden ilegibles. Por encima de los 900px dejamos que los días se repartan todo el ancho
  // disponible sin forzar un mínimo, para que la semana completa entre siempre (antes, con un
  // mínimo fijo de 108px por día, el domingo podía quedar cortado por scroll horizontal apenas
  // el panel del calendario no tuviera esos ~800px libres).
  const [colAngosta, setColAngosta] = useState(false);
  useLayoutEffect(() => {
    function ajustar() {
      const el = scrollRef.current;
      if (!el) return;
      const espacioDisponible = window.innerHeight - el.getBoundingClientRect().top - 90;
      const horasDeRango = rango / 60;
      setPxPorHora(Math.max(30, Math.min(56, Math.floor(espacioDisponible / horasDeRango))));
      setColAngosta(window.innerWidth < 900);
    }
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [rango]);
  const alturaTotal = (rango / 60) * pxPorHora;

  const horas = [];
  for (let m = Math.ceil(desdeMin / 60) * 60; m <= hastaMin; m += 60) horas.push(m);

  const anchoMin = colAngosta ? dias.length * 108 + 46 : undefined;

  return (
    <div
      ref={scrollRef}
      className="semanaScrollImprimible"
      style={{ ...S.semanaScroll, maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}
    >
      <div style={{ minWidth: anchoMin }}>
        <div className="semanaHeaderSticky" style={{ display: "flex", position: "sticky", top: 0, zIndex: 2, background: CARD, paddingBottom: 2 }}>
          <div style={S.semanaAxisSpacer} />
          <div className="diasGridLineas" style={{ display: "grid", gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`, flex: 1, gap: 10 }}>
            {dias.map((fecha, i) => {
              const y = fecha.getFullYear(), m = fecha.getMonth() + 1, d = fecha.getDate();
              const key = dateKey(y, m, d);
              const hoy = esHoy(y, m, d);
              const sel = !!fechaSeleccionada && fechaSeleccionada.year === y && fechaSeleccionada.month === m && fechaSeleccionada.day === d;
              const feriado = getFeriados(y)[key];
              let estilo = S.semanaDiaHeader;
              if (sel) estilo = S.semanaDiaHeaderSel;
              else if (hoy) estilo = S.semanaDiaHeaderHoy;
              const marcadoParaCopiar = diasParaCopiar && diasParaCopiar.has(key);
              if (marcadoParaCopiar) estilo = { ...estilo, ...S.diaMarcadoParaCopiar };
              return (
                <button
                  key={i}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) onToggleDiaParaCopiar({ year: y, month: m, day: d });
                    else onSelectFecha({ year: y, month: m, day: d });
                  }}
                  style={estilo}
                  title={feriado || undefined}
                >
                  <span style={S.semanaDiaHeaderNombre}>{DIAS_SEMANA_LARGO[fecha.getDay()].slice(0, 3)}</span>
                  <span style={S.semanaDiaHeaderNum}>
                    {d}{feriado && <span style={S.feriadoDot} />}{marcadoParaCopiar && <span style={S.multicopiaCheck}>✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 6 }}>
          <div style={{ ...S.semanaAxis, height: alturaTotal }}>
            {horas.map((m) => (
              <div key={m} style={{ ...S.semanaHoraLabel, top: ((m - desdeMin) / rango) * alturaTotal }}>
                {minAHHMM(m)}
              </div>
            ))}
          </div>
          <div className="diasGridLineas" style={{ display: "grid", gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`, flex: 1, gap: 10, position: "relative" }}>
            {dias.map((fecha, i) => {
              const y = fecha.getFullYear(), m = fecha.getMonth() + 1, d = fecha.getDate();
              const key = dateKey(y, m, d);
              const cerrado = estaCerrado(local, y, m, d);
              const vacacionesHoy = vendedoresDeVacaciones(vendedores, y, m, d);
              const francoHoy = vendedoresDeFranco(vendedores, y, m, d).filter(
                (v) => !vacacionesHoy.some((e) => e.id === v.id)
              );
              const eventos = [];
              vendedores.forEach((v) => {
                (v.dias[key]?.turnos || []).forEach((t, idx) => {
                  eventos.push({
                    vId: v.id, nombre: v.nombre, color: v.color, idx,
                    inicioMin: minutosDe(t.inicio), finMin: minutosDe(t.fin),
                  });
                });
              });
              const dispuestos = disponerEventos(eventos);
              const ahora = new Date();
              const esHoyCol = ahora.getFullYear() === y && ahora.getMonth() + 1 === m && ahora.getDate() === d;
              const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
              const mostrarAhora = esHoyCol && minAhora >= desdeMin && minAhora <= hastaMin;

              return (
                <div
                  key={i}
                  style={{ ...S.semanaDiaCol, height: alturaTotal, ...(cerrado ? S.semanaDiaColCerrado : {}) }}
                  onClick={() => onSelectFecha({ year: y, month: m, day: d })}
                >
                  {horas.map((hm) => (
                    <div key={hm} style={{ ...S.semanaGridLine, top: ((hm - desdeMin) / rango) * alturaTotal }} />
                  ))}
                  {mostrarAhora && (
                    <div style={{ ...S.semanaAhora, top: ((minAhora - desdeMin) / rango) * alturaTotal }}>
                      <span style={S.semanaAhoraDot} />
                    </div>
                  )}
                  {vacacionesHoy.length > 0 && (
                    <div
                      style={S.semanaVacacionesBanda}
                      title={`De vacaciones: ${vacacionesHoy.map((v) => v.nombre || "Sin nombre").join(", ")}`}
                    >
                      {vacacionesHoy.map((v) => (
                        <span key={v.id} style={{ ...S.semanaVacacionesDot, background: v.color }} />
                      ))}
                    </div>
                  )}
                  {francoHoy.length > 0 && (
                    <div
                      style={{ ...S.semanaFrancoBanda, top: vacacionesHoy.length > 0 ? 12 : 2 }}
                      title={`Franco: ${francoHoy.map((v) => v.nombre || "Sin nombre").join(", ")}`}
                    >
                      {francoHoy.map((v) => (
                        <span key={v.id} style={{ ...S.semanaFrancoDot, background: v.color }} />
                      ))}
                    </div>
                  )}
                  {dispuestos.map((ev) => {
                    // Se recorta 1px arriba y abajo (igual que el "- 3px" del ancho, para las
                    // columnas lado a lado) para que se note un corte entre dos turnos seguidos
                    // del mismo día en vez de que los bloques queden pegados sin separación.
                    const top = ((ev.inicioMin - desdeMin) / rango) * alturaTotal + 1;
                    const alto = Math.max(20, ((ev.finMin - ev.inicioMin) / rango) * alturaTotal - 2);
                    const left = (ev.col / ev.totalCols) * 100;
                    const ancho = 100 / ev.totalCols;
                    return (
                      <button
                        key={ev.vId + "-" + ev.idx}
                        data-vendedor-id={ev.vId}
                        onClick={(e) => { e.stopPropagation(); onSelectFecha({ year: y, month: m, day: d }); onSelectVendedor(ev.vId); }}
                        style={{ ...S.semanaEvento, top, height: alto, left: `${left}%`, width: `calc(${ancho}% - 3px)`, background: ev.color, color: colorTextoContraste(ev.color) }}
                        title={`${ev.nombre || "Sin nombre"}: ${fmtHoraCorta(minAHHMM(ev.inicioMin))}-${fmtHoraCorta(minAHHMM(ev.finMin))}`}
                      >
                        <span style={S.semanaEventoNombre}>{ev.nombre || "Sin nombre"}</span>
                        {alto >= 38 && (
                          <span style={S.semanaEventoHora}>{fmtHoraCorta(minAHHMM(ev.inicioMin))}–{fmtHoraCorta(minAHHMM(ev.finMin))}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function VendedorEditor({ v, prefix, onChange, onCopiarMesAnterior, onRepetirSemana, onCopiarSemanaAnterior, onRemove, canRemove, horasCalc }) {
  const diasMarcados = Object.keys(v.dias).filter((k) => k.startsWith(prefix)).length;

  // El aviso de cada acción ("se copiaron N días", "no hay nada para copiar") ahora lo muestra
  // el toast único de App (ver mostrarToast) — estos botones llaman directo a la función de App,
  // sin manejar su propio mensaje/timeout como antes.
  return (
    <div>
      <div style={S.rowBetween}>
        <input
          value={v.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="Nombre del vendedor"
          style={S.nameInputSm}
        />
        {canRemove && (
          <button onClick={onRemove} style={S.iconGhost}><Trash2 size={13} /></button>
        )}
      </div>

      <div style={S.miniStat}>{diasMarcados} días marcados · {fmt(horasCalc, 1)} hs este mes</div>
      <div style={S.rowBetween3}>
        <button onClick={onCopiarMesAnterior} style={S.copyBtn}>Copiar mes anterior</button>
        <button onClick={onRepetirSemana} style={S.copyBtn}>Repetir 1ª semana</button>
        <button onClick={onCopiarSemanaAnterior} style={S.copyBtn}>Copiar semana anterior</button>
      </div>
    </div>
  );
}

// Panel de edición del horario del vendedor seleccionado, para la fecha elegida en el calendario.
// El aviso de huecos y el resumen del día consideran a TODOS los vendedores, no solo al activo.
function TurnoEditorCard({
  vendedor, vendedores, local, fecha, onCambiarFecha, onSetTurnos, onQuitarDia,
  copiaDisponible, diasSeleccionadosParaCopiar, onCopiarDia, onLimpiarSeleccion, onPegarDia,
}) {
  if (!vendedor) return null;

  const haySeleccionMultiple = diasSeleccionadosParaCopiar > 0;
  const mostrarBotonesCopiar = !!fecha || haySeleccionMultiple;

  const cambiarDia = (delta) => {
    const base = fecha || hoyComoFecha();
    const d = sumarDias(new Date(base.year, base.month - 1, base.day), delta);
    onCambiarFecha({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  };

  // El aviso de "día copiado" / "se pegaron N días" ahora lo muestra el toast único de App
  // (copiarDias/pegarDias ya llaman a mostrarToast); acá solo se dispara la acción.
  const cerrado = fecha ? estaCerrado(local, fecha.year, fecha.month, fecha.day) : false;
  const feriado = fecha ? feriadosArgentina(fecha.year)[dateKey(fecha.year, fecha.month, fecha.day)] : null;
  const horarioDia = fecha ? horarioDelDia(local, fecha.year, fecha.month, fecha.day) : null;
  const huecos = fecha && !cerrado
    ? huecosDelDia(vendedores, dateKey(fecha.year, fecha.month, fecha.day), horarioDia.inicio, horarioDia.fin)
    : [];

  return (
    <div style={S.card}>
      <div style={S.eyebrowLine}>// HORARIO</div>
      <div style={S.rowBetween}>
        <div style={S.turnoEditorTitle}>
          <span style={{ ...S.legendDot, background: vendedor.color }} />
          <span>{vendedor.nombre || "Sin nombre"}</span>
        </div>
        {fecha && (
          <div style={S.dayNavRow}>
            <button onClick={() => cambiarDia(-1)} style={S.navBtnSm}><ChevronLeft size={13} /></button>
            <span style={S.dayNavLabel}>{fecha.day} de {MESES[fecha.month - 1].slice(0, 3)}</span>
            <button onClick={() => cambiarDia(1)} style={S.navBtnSm}><ChevronRight size={13} /></button>
          </div>
        )}
      </div>

      {mostrarBotonesCopiar && (
        <>
          <div style={S.rowBetween3}>
            <button onClick={onCopiarDia} style={S.copyBtn}>
              {haySeleccionMultiple ? `Copiar ${diasSeleccionadosParaCopiar} días seleccionados` : "Copiar este día"}
            </button>
            {haySeleccionMultiple && (
              <button onClick={onLimpiarSeleccion} style={S.copyBtnDisabled} title="Cancelar la selección de días">✕</button>
            )}
            <button
              onClick={onPegarDia}
              disabled={!copiaDisponible || !fecha}
              style={copiaDisponible && fecha ? S.copyBtn : S.copyBtnDisabled}
            >
              {copiaDisponible
                ? `Pegar ${copiaDisponible.cantidadDias === 1 ? "el día copiado" : `los ${copiaDisponible.cantidadDias} días copiados`}`
                : "Pegar día copiado"}
            </button>
          </div>
          {haySeleccionMultiple && (
            <div style={S.notePlainSinMargen}>
              Elegí más días con Ctrl+clic (o Cmd+clic), o tocá "Copiar" para juntarlos ya.
            </div>
          )}
        </>
      )}

      {fecha && (() => {
        const key = dateKey(fecha.year, fecha.month, fecha.day);
        const conHorario = vendedores.filter((v) => v.dias[key]?.turnos?.length);
        const sinHorario = vendedores.filter((v) => !v.dias[key]?.turnos?.length);
        if (conHorario.length === 0 && sinHorario.length === 0) return null;
        return (
          <div style={S.diaResumenBlock}>
            {conHorario.length === 0 ? (
              <div style={S.notePlainSinMargen}>Nadie tiene horario cargado este día.</div>
            ) : (
              conHorario.map((v) => (
                <div key={v.id} style={S.diaResumenRow}>
                  <span style={{ ...S.legendDot, background: v.color }} />
                  <span style={S.diaResumenNombre}>{v.nombre || "Sin nombre"}</span>
                  <span style={S.diaResumenHoras}>{fmtResumenDia(v.dias[key])}</span>
                </div>
              ))
            )}
            {sinHorario.length > 0 && (
              <div style={S.diaResumenSinHorario}>
                No trabajan: {sinHorario.map((v) => v.nombre || "Sin nombre").join(", ")}
              </div>
            )}
          </div>
        );
      })()}

      {feriado && (
        <div className="avisoDia" style={S.notePlain}>📅 Feriado nacional: {feriado}</div>
      )}

      {cerrado && (
        <div className="avisoDia" style={S.notePlain}>Este día el local figura cerrado. Igual podés cargar un horario si hace falta (ej. reposición).</div>
      )}

      {huecos.length > 0 && (
        <div className="avisoDia" style={S.gapWarning}>
          ⚠ Sin cobertura de nadie: {huecos.map((h) => `${h.inicio}–${h.fin}`).join(", ")}
        </div>
      )}

      {!fecha ? (
        <div style={S.notePlain}>Tocá un día en el calendario para cargar su horario.</div>
      ) : (
        <TurnoEditorDia
          vendedor={vendedor}
          local={local}
          fecha={fecha}
          onSetTurnos={onSetTurnos}
          onQuitarDia={onQuitarDia}
        />
      )}
    </div>
  );
}

function TurnoEditorDia({ vendedor, local, fecha, onSetTurnos, onQuitarDia }) {
  if (estaDeVacaciones(vendedor, fecha.year, fecha.month, fecha.day)) {
    return (
      <div style={S.vacacionBloqueoAviso}>
        🏖 {vendedor.nombre || "Este vendedor"} está de vacaciones este día. No se puede cargar horario.
      </div>
    );
  }
  if (esFrancoVendedor(vendedor, fecha.year, fecha.month, fecha.day)) {
    return (
      <div style={S.francoBloqueoAviso}>
        🛌 {vendedor.nombre || "Este vendedor"} tiene franco fijo este día. No se puede cargar horario.
      </div>
    );
  }
  const key = dateKey(fecha.year, fecha.month, fecha.day);
  const turnos = vendedor.dias[key]?.turnos || [];
  const horarioDia = horarioDelDia(local, fecha.year, fecha.month, fecha.day);
  const opciones = generarOpcionesHora(horarioDia.inicio, horarioDia.fin);
  const opcionesInicio = opciones.length > 1 ? opciones.slice(0, -1) : opciones;

  const setTurno = (idx, campo, valor) => {
    const nuevos = turnos.map((t, i) => {
      if (i !== idx) return t;
      if (campo === "inicio") {
        // El fin siempre tiene que quedar después del inicio: si el nuevo inicio
        // alcanza o supera el fin actual, corremos el fin hacia adelante.
        let fin = t.fin;
        if (minutosDe(valor) >= minutosDe(fin)) {
          fin = minAHHMM(Math.min(minutosDe(valor) + 30, minutosDe(horarioDia.fin)));
        }
        return { ...t, inicio: valor, fin };
      }
      return { ...t, fin: valor };
    });
    onSetTurnos(nuevos);
  };
  const agregarBloque = () => {
    if (turnos.length >= 2) return;
    onSetTurnos([...turnos, nuevoTurnoDefault(horarioDia.inicio, horarioDia.fin, turnos)]);
  };
  const quitarBloque = (idx) => {
    const nuevos = turnos.filter((_, i) => i !== idx);
    if (nuevos.length === 0) onQuitarDia();
    else onSetTurnos(nuevos);
  };

  return (
    <div>
      {turnos.length === 0 ? (
        <button onClick={agregarBloque} style={S.addBtn}>
          <Plus size={13} /> Agregar horario
        </button>
      ) : (
        <>
          {turnos.map((t, idx) => {
            const opcionesFin = opciones.filter((h) => minutosDe(h) > minutosDe(t.inicio));
            return (
              <div key={idx} style={S.turnoRow}>
                <select value={t.inicio} onChange={(e) => setTurno(idx, "inicio", e.target.value)} style={S.turnoSelect}>
                  {opcionesInicio.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span style={S.turnoA}>a</span>
                <select value={t.fin} onChange={(e) => setTurno(idx, "fin", e.target.value)} style={S.turnoSelect}>
                  {opcionesFin.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <button onClick={() => quitarBloque(idx)} style={S.iconGhost}><Trash2 size={13} /></button>
              </div>
            );
          })}
          {turnos.length < 2 && (
            <button onClick={agregarBloque} style={S.copyBtn}>
              + Agregar bloque (horario partido)
            </button>
          )}
          <div style={S.miniStat}>Total del día: {fmt(horasDelDia({ turnos }), 1)} hs</div>
        </>
      )}
    </div>
  );
}

/* ---------- estilo: ranking VDH, en azul petróleo (con variables para modo oscuro) ---------- */

const ACCENT = "var(--accent)";
const ACCENT_SOFT = "var(--accent-soft)";
const INK = "var(--ink)";
const SUB = "var(--sub)";
const BG = "var(--bg)";
const CARD = "var(--card)";
const LINE = "var(--line)";
const GOOD = "var(--good)";
const DANGER = "var(--danger)";
const DANGER_BG = "var(--danger-bg)";
const WARN = "var(--warn)";
const WARN_BG = "var(--warn-bg)";
const SURFACE_2 = "var(--surface-2)";
const SURFACE_INPUT = "var(--surface-input)";

const S = {
  page: {
    minHeight: "100vh", background: BG, color: INK,
    // Roboto es la que usa Google Calendar/Workspace en la web; si por lo que sea no llega a
    // cargar (sin internet, bloqueada), cae en la misma pila de fuentes del sistema de antes.
    fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
    // Antes el máximo era un valor fijo (1460px): en una notebook (viewport típico
    // 1366–1440px) eso ya ocupaba todo el ancho y se veía bien, pero en un monitor de 27" (2560px
    // de ancho o más) dejaba más de 500px vacíos de cada lado. Los paneles laterales son de ancho
    // fijo (280/300px, ver .appGrid más abajo), así que todo ese espacio extra iría al calendario
    // del medio — el que más se beneficia de tener más lugar. Con "min(...)" se adapta solo al
    // ancho de cada pantalla: en monitores grandes crece hasta 2200px (después de eso un
    // ultrawide dejaría columnas de día absurdamente anchas), y en pantallas chicas no hace nada
    // porque el 98vw ya da menos que eso.
    padding: "24px 20px 48px", maxWidth: "min(2200px, 98vw)", margin: "0 auto",
  },
  loadingWrap: { minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" },
  loadingDot: { width: 10, height: 10, borderRadius: 999, background: ACCENT, animation: "pulse 1s infinite ease-in-out" },
  headerBand: {
    background: CARD, borderRadius: 16, padding: "9px 12px", marginBottom: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -12px rgba(0,0,0,0.08)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
  },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 },
  headerRightRow: { display: "flex", alignItems: "center", gap: 8 },
  logoRow: { display: "flex", alignItems: "center", gap: 7 },
  logoMark: {
    width: 26, height: 26, borderRadius: 8, background: ACCENT, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, letterSpacing: "-0.02em",
    flexShrink: 0,
  },
  brandTitle: { fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1, color: INK },
  brandSubtitle: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: SUB, marginTop: 0 },
  savedPill: {
    display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700,
    color: GOOD, transition: "opacity 0.5s ease",
  },
  errorPill: {
    display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700,
    color: DANGER, background: DANGER_BG, border: "none", borderRadius: 999,
    padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap",
  },
  toastDeshacerBtn: {
    // El color de "Deshacer" lo pone la clase .toastDeshacer del CSS (no acá): el toast
    // invierte los colores del tema (fondo oscuro en modo claro y viceversa), así que necesita
    // su propio acento por tema en vez de heredar el --accent de la página.
    fontSize: 12.5, fontWeight: 800,
    background: "transparent", border: "none", cursor: "pointer", padding: "4px 2px", whiteSpace: "nowrap",
  },
  toastCerrarBtn: {
    fontSize: 15, lineHeight: 1, color: "inherit", opacity: 0.6, background: "transparent",
    border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 999,
  },
  syncBadgeOn: { fontSize: 10, fontWeight: 700, color: ACCENT },
  syncBadgeOff: { fontSize: 10, fontWeight: 700, color: SUB },
  undoBtn: {
    fontSize: 12, fontWeight: 700, color: INK, background: SURFACE_2, border: "none",
    borderRadius: 8, padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap",
  },
  undoBtnDisabled: {
    fontSize: 12, fontWeight: 700, color: SUB, background: "transparent", border: "none",
    borderRadius: 8, padding: "5px 9px", cursor: "default", opacity: 0.4, whiteSpace: "nowrap",
  },
  temaBtn: {
    width: 22, height: 22, borderRadius: 999, border: "none", background: "transparent",
    fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  },
  panelToggleBtn: {
    width: 26, height: 26, borderRadius: 8, border: "none", background: SURFACE_2, color: INK,
    fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0, flexShrink: 0,
  },
  localDropdownWrap: { position: "relative", flex: "1 1 220px", maxWidth: 340, minWidth: 160 },
  localDropdownBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    background: BG, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 11px",
    cursor: "pointer",
  },
  localDropdownText: { fontSize: 13, fontWeight: 700, color: INK },
  localDropdownList: {
    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 10,
    background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 6,
    boxShadow: "0 10px 24px -8px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 2,
  },
  localOption: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: INK,
    background: "transparent", border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left",
  },
  localOptionActive: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: ACCENT,
    background: ACCENT_SOFT, border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left",
  },
  localOptionAdd: {
    display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: SUB,
    background: "transparent", border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left",
    borderTop: `1px solid ${LINE}`, marginTop: 2,
  },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: {
    fontSize: 12, fontWeight: 600, color: SUB, background: CARD, border: `1px solid ${LINE}`,
    borderRadius: 999, padding: "7px 12px", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  },
  chipActiveAccent: {
    fontSize: 12, fontWeight: 700, color: "#fff", border: "none",
    borderRadius: 999, padding: "7px 12px", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  },
  chipDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0, display: "inline-block" },
  card: {
    background: CARD, borderRadius: 16, padding: 15,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -12px rgba(0,0,0,0.08)",
  },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  nameInput: { fontSize: 16, fontWeight: 700, border: "none", background: "transparent", outline: "none", color: INK, flex: 1 },
  nameInputSm: {
    fontSize: 14, fontWeight: 700, color: INK, flex: 1, outline: "none",
    border: `1.5px solid ${LINE}`, borderRadius: 8, background: SURFACE_INPUT,
    padding: "8px 10px",
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: SUB, fontWeight: 600 },
  input: {
    border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 10px", fontSize: 14,
    color: INK, background: SURFACE_INPUT, outline: "none", width: "100%", boxSizing: "border-box",
  },
  iconGhost: {
    width: 28, height: 28, borderRadius: 8, border: "none", background: DANGER_BG, color: DANGER,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: INK },
  addBtn: {
    display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#fff",
    background: ACCENT, border: "none", borderRadius: 8, padding: "7px 11px", cursor: "pointer",
  },
  smallGhostBtn: {
    fontSize: 12, fontWeight: 600, color: SUB, background: SURFACE_2, border: "none",
    borderRadius: 8, padding: "7px 10px", cursor: "pointer",
  },
  miniStat: { fontSize: 12, color: SUB, fontWeight: 600, marginTop: 4 },
  monthNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  navBtn: {
    width: 28, height: 28, borderRadius: 999, border: `1px solid ${LINE}`, background: SURFACE_INPUT,
    color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  },
  navBtnSm: {
    width: 22, height: 22, borderRadius: 999, border: `1px solid ${LINE}`, background: SURFACE_INPUT,
    color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  hoyBtn: {
    fontSize: 12, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, border: "none",
    borderRadius: 999, padding: "6px 13px", cursor: "pointer", marginLeft: 4,
  },
  monthLabel: { fontSize: 14, fontWeight: 700, minWidth: 120, textAlign: "center", color: INK },
  vistaSwitchRow: { display: "flex", gap: 4, flexShrink: 0 },
  encabezadoImpresion: { marginBottom: 10 },
  vistaBtn: {
    fontSize: 12, fontWeight: 700, color: SUB, background: SURFACE_2, border: "none",
    borderRadius: 8, padding: "6px 10px", cursor: "pointer",
  },
  compartirMenuWrap: { position: "relative" },
  compartirMenuPanel: {
    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 10, width: 230,
    background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 10,
    boxShadow: "0 10px 24px -8px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 8,
  },
  compartirMenuTitulo: { fontSize: 11, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: "0.03em" },
  compartirMenuLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: SUB },
  compartirMenuSelect: {
    border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 8px", fontSize: 13,
    color: INK, background: SURFACE_INPUT, outline: "none", width: "100%", boxSizing: "border-box",
  },
  compartirMenuBtn: {
    display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: INK,
    background: SURFACE_2, border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer",
    width: "100%", textAlign: "left",
  },
  vistaBtnActive: {
    fontSize: 12, fontWeight: 700, color: "#fff", background: ACCENT, border: "none",
    borderRadius: 8, padding: "6px 10px", cursor: "pointer",
  },
  weekHeader: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", marginBottom: 4 },
  weekHeaderCell: { fontSize: 11, color: SUB, fontWeight: 700, textAlign: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 5 },
  dayCell: {
    minHeight: 86, border: "none", borderRadius: 12, background: SURFACE_2, color: INK,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "5px 4px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayCellSelected: {
    minHeight: 86, border: `1.5px solid ${ACCENT}`, borderRadius: 12, background: ACCENT_SOFT, color: INK,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "4.5px 3.5px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayCellHoy: {
    minHeight: 86, border: `1.5px solid ${ACCENT}`, borderRadius: 12, background: SURFACE_2, color: INK,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "4.5px 3.5px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayCellCerrado: {
    minHeight: 86, border: "none", borderRadius: 12, color: SUB,
    background: `repeating-linear-gradient(135deg, ${SURFACE_2}, ${SURFACE_2} 6px, transparent 6px, transparent 12px), ${CARD}`,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "5px 4px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayNumRow: { fontSize: 11, fontWeight: 700, color: INK, padding: "0 2px", display: "flex", alignItems: "center", gap: 3 },
  dayNumRowHoy: { fontSize: 11, fontWeight: 800, color: ACCENT, padding: "0 2px", display: "flex", alignItems: "center", gap: 3 },
  dayNumRowCerrado: { fontSize: 11, fontWeight: 700, color: SUB, padding: "0 2px", display: "flex", alignItems: "center", gap: 3 },
  cerradoLabel: { fontSize: 10, fontWeight: 700, color: SUB, padding: "0 2px" },
  feriadoDot: { width: 5, height: 5, borderRadius: 999, background: "var(--feriado)", flexShrink: 0, display: "inline-block" },
  feriadoLabel: { fontSize: 10, fontWeight: 700, color: "var(--feriado)", padding: "0 2px" },
  turnoTextLabel: {
    display: "flex", alignItems: "center", gap: 3, width: "100%", flexShrink: 0, minWidth: 0,
  },
  turnoDot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0, display: "inline-block" },
  turnoTextInner: {
    fontSize: 10, fontWeight: 700, lineHeight: 1.35, color: INK, minWidth: 0,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  vacacionTextInner: {
    fontSize: 10, fontWeight: 700, lineHeight: 1.35, color: "var(--vacaciones)", minWidth: 0,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontStyle: "italic",
  },
  francoTextInner: {
    fontSize: 10, fontWeight: 700, lineHeight: 1.35, color: SUB, minWidth: 0,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  moreBadge: { fontSize: 10, fontWeight: 700, color: SUB, padding: "0 3px" },
  gapDot: { width: 5, height: 5, borderRadius: 999, background: WARN, flexShrink: 0, display: "inline-block" },
  // Días marcados con Ctrl/Cmd+clic para copiarlos juntos: un aro de color aparte (no pisa el
  // borde de "seleccionado" ni el tamaño de la celda, va por afuera con boxShadow).
  diaMarcadoParaCopiar: { boxShadow: "0 0 0 2px var(--multicopia) inset" },
  multicopiaCheck: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 12, height: 12,
    borderRadius: 999, background: "var(--multicopia)", color: "#fff", fontSize: 8, fontWeight: 800, lineHeight: 1,
  },
  gapWarning: {
    fontSize: 12, fontWeight: 600, color: WARN, background: WARN_BG, borderRadius: 8,
    padding: "8px 10px", marginBottom: 10, lineHeight: 1.4,
  },
  vacacionBloqueoAviso: { fontSize: 13, fontWeight: 700, color: "var(--vacaciones)", lineHeight: 1.4, padding: "10px 0" },
  francoBloqueoAviso: { fontSize: 13, fontWeight: 700, color: SUB, lineHeight: 1.4, padding: "10px 0" },
  legendRow: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` },
  legendChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: SUB },
  legendDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0, display: "inline-block" },
  rowBetween3: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  copyBtn: {
    fontSize: 11, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, border: "none",
    borderRadius: 8, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap",
  },
  copyBtnDisabled: {
    fontSize: 11, fontWeight: 700, color: SUB, background: SURFACE_2, border: "none",
    borderRadius: 8, padding: "6px 10px", cursor: "default", whiteSpace: "nowrap", opacity: 0.6,
  },
  copiadoMsg: { fontSize: 11, color: ACCENT, fontWeight: 600, marginTop: 6 },
  note: { fontSize: 12, color: DANGER, lineHeight: 1.4 },
  notePlain: { fontSize: 12, color: SUB, lineHeight: 1.4, marginBottom: 10 },
  eyebrowLine: { fontSize: 11, fontWeight: 700, color: SUB, marginBottom: 2 },
  turnoEditorTitle: { display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 700, color: INK },
  diaResumenBlock: {
    display: "flex", flexDirection: "column", gap: 5, background: SURFACE_2, borderRadius: 12,
    padding: "8px 10px", marginTop: 10, marginBottom: 10,
  },
  diaResumenRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12 },
  diaResumenNombre: { fontWeight: 700, color: INK, flexShrink: 0 },
  diaResumenHoras: { color: SUB, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  diaResumenSinHorario: { fontSize: 11, color: SUB, fontWeight: 600, marginTop: 4, paddingTop: 5, borderTop: `1px solid ${LINE}` },
  notePlainSinMargen: { fontSize: 12, color: SUB, lineHeight: 1.4 },
  dayNavRow: { display: "flex", alignItems: "center", gap: 6 },
  dayNavLabel: { fontSize: 12, fontWeight: 700, color: INK, minWidth: 56, textAlign: "center" },
  turnoRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  turnoSelect: {
    flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 6px", fontSize: 13,
    color: INK, background: SURFACE_INPUT, outline: "none", minWidth: 0,
  },
  turnoA: { fontSize: 12, color: SUB, fontWeight: 600, flexShrink: 0 },
  rankList: { display: "flex", flexDirection: "column", gap: 8 },
  rankCard: {
    display: "flex", alignItems: "center", gap: 10, background: BG, borderRadius: 12, padding: "10px 12px",
  },
  rankCardTop: {
    display: "flex", alignItems: "center", gap: 10, background: ACCENT_SOFT, borderRadius: 12, padding: "10px 12px",
    border: `1.5px solid ${ACCENT}`,
  },
  rankBadge: { width: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rankDot: { width: 10, height: 10, borderRadius: 999, flexShrink: 0, display: "inline-block" },
  rankInfo: { flex: 1, minWidth: 0 },
  rankName: { fontSize: 13, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  rankSub: { fontSize: 11, color: SUB, fontWeight: 500, marginTop: 1 },
  rankRight: { textAlign: "right", flexShrink: 0 },
  rankPct: { fontSize: 16, fontWeight: 800, color: INK },
  rankMoney: { fontSize: 11, color: SUB, fontWeight: 600, marginTop: 1 },
  rowBetween2: {
    display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10,
    borderTop: `1px solid ${LINE}`,
  },
  miniStatStrong: { fontSize: 12, fontWeight: 800, color: INK },
  cerradosBlock: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` },
  configToggleBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    marginTop: 12, paddingTop: 12, paddingBottom: 2,
    borderWidth: 0, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: LINE,
    background: "transparent", cursor: "pointer", color: SUB, fontSize: 12, fontWeight: 700,
  },
  cerradosChipRow: { display: "flex", gap: 5, marginTop: 6 },
  cerradoChip: {
    width: 30, height: 30, borderRadius: 8, border: `1px solid ${LINE}`, background: SURFACE_INPUT,
    color: SUB, fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  cerradoChipActivo: {
    width: 30, height: 30, borderRadius: 8, border: "none", background: DANGER_BG,
    color: DANGER, fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  feriadoPickerRow: { display: "flex", gap: 6, marginTop: 6 },
  feriadoList: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  feriadoChip: {
    display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: INK,
    background: SURFACE_2, borderRadius: 999, padding: "4px 4px 4px 10px",
  },
  feriadoRemove: {
    width: 16, height: 16, borderRadius: 999, border: "none", background: "transparent", color: SUB,
    fontSize: 13, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  semanaScroll: { overflowX: "auto", WebkitOverflowScrolling: "touch" },
  semanaAxisSpacer: { width: 42, flexShrink: 0 },
  semanaAxis: { width: 42, flexShrink: 0, position: "relative" },
  semanaHoraLabel: {
    position: "absolute", right: 6, transform: "translateY(-50%)",
    fontSize: 10, color: SUB, fontWeight: 600, whiteSpace: "nowrap",
  },
  semanaDiaHeader: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 2px",
    borderRadius: 8, border: "none", background: "transparent", cursor: "pointer",
  },
  semanaDiaHeaderHoy: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 2px",
    borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: ACCENT,
  },
  semanaDiaHeaderSel: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 2px",
    borderRadius: 8, border: `1px solid ${ACCENT}`, background: ACCENT_SOFT, cursor: "pointer",
  },
  semanaDiaHeaderNombre: { fontSize: 10, fontWeight: 700, color: SUB, textTransform: "uppercase" },
  semanaDiaHeaderNum: { fontSize: 14, fontWeight: 800, color: INK, display: "flex", alignItems: "center", gap: 3 },
  // La línea que separa un día del otro la pone la clase "diasGridLineas" (ver el CSS de abajo),
  // así queda continua desde el encabezado del día hasta el final de la grilla, como en Calendar.
  semanaDiaCol: { position: "relative", cursor: "pointer" },
  semanaDiaColCerrado: {
    background: `repeating-linear-gradient(135deg, ${SURFACE_2}, ${SURFACE_2} 6px, transparent 6px, transparent 12px)`,
  },
  semanaGridLine: { position: "absolute", left: 0, right: 0, borderTop: `1px solid ${LINE}`, pointerEvents: "none" },
  semanaAhora: { position: "absolute", left: 0, right: 0, height: 2, background: "var(--ahora)", zIndex: 5, pointerEvents: "none" },
  semanaAhoraDot: { position: "absolute", left: -3, top: -3, width: 8, height: 8, borderRadius: 999, background: "var(--ahora)" },
  semanaVacacionesBanda: { position: "absolute", top: 2, left: 2, right: 2, display: "flex", gap: 3, zIndex: 4, pointerEvents: "none" },
  semanaVacacionesDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0, display: "inline-block", boxShadow: "0 0 0 1.5px var(--vacaciones)" },
  semanaFrancoBanda: { position: "absolute", top: 2, left: 2, right: 2, display: "flex", gap: 3, zIndex: 4, pointerEvents: "none" },
  semanaFrancoDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0, display: "inline-block", boxShadow: "0 0 0 1.5px var(--sub)" },
  semanaEvento: {
    position: "absolute", borderRadius: 8, padding: "3px 6px", color: "#fff", border: "none",
    cursor: "pointer", overflow: "hidden", textAlign: "left", display: "flex", flexDirection: "column",
    boxSizing: "border-box",
  },
  semanaEventoNombre: { fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  semanaEventoHora: { fontSize: 11, fontWeight: 600, opacity: 0.9 },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800&display=swap');

  .vdhApp {
    color-scheme: light;
    --accent: #2C6E71;
    --accent-soft: #E3EFEE;
    --ink: #232823;
    /* #8C9089 (el gris viejo) daba 3.2:1 sobre blanco, por debajo del mínimo de 4.5:1 para
       texto normal (WCAG AA) — este gris da ~5:1 y se lee bien sin perder la jerarquía sutil
       que tiene que tener un texto "secundario". */
    --sub: #6B7169;
    --bg: #EDF1F0;
    --card: #FFFFFF;
    --line: #E7E4DA;
    --good: #2C6E71;
    --danger: #A97A66;
    --danger-bg: #F2E9E4;
    --warn: #C98A2E;
    --warn-bg: #F5EDDD;
    --surface-2: #F5F5F7;
    --surface-input: #FAFAFB;
    --feriado: #8B6FB0;
    --multicopia: #4A5FD9;
    --linea-dia: #C9C5B8;
    --ahora: #E0524A;
    --vacaciones: #3F8F5F;
  }
  .vdhApp[data-theme="dark"] {
    color-scheme: dark;
    --accent: #4FA6A6;
    --accent-soft: #1E3536;
    --ink: #E7EBE8;
    --sub: #93A19C;
    --bg: #14181A;
    --card: #1D2224;
    --line: #2B3234;
    --good: #4FA6A6;
    --danger: #D69A82;
    --danger-bg: #3A2A22;
    --warn: #E3B15E;
    --warn-bg: #3A2E18;
    --surface-2: #242B2D;
    --surface-input: #1B2224;
    --feriado: #C7A6E8;
    --multicopia: #8B9BFF;
    --linea-dia: #414A4D;
    --ahora: #E37066;
    --vacaciones: #6FBF8B;
  }

  * { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: var(--line); border-radius: 99px; }
  *::-webkit-scrollbar-thumb:hover { background: var(--sub); }

  input:focus, select:focus { outline: none; }
  input[style*="border"]:focus, select[style*="border"]:focus {
    border-color: ${ACCENT} !important;
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  /* Hover / press / foco de teclado para TODA la app: sin esto ningún botón, chip, día del
     calendario o turno responde antes del clic, que es lo que más hace sentir a una interfaz
     "sin terminar". Se resuelve con una sola regla general (funciona para cualquier color de
     fondo, sea el que sea) en vez de tener que declarar un :hover por cada estilo puntual. */
  button, [role="button"], .diaClickeable {
    -webkit-tap-highlight-color: transparent;
    transition: filter 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease, opacity 0.12s ease, background-color 0.12s ease;
  }
  button:disabled { cursor: default; }
  @media (hover: hover) {
    button:not(:disabled):hover, [role="button"]:not([aria-disabled="true"]):hover { filter: brightness(0.96); }
    .vdhApp[data-theme="dark"] button:not(:disabled):hover,
    .vdhApp[data-theme="dark"] [role="button"]:not([aria-disabled="true"]):hover { filter: brightness(1.18); }
  }
  button:not(:disabled):active, [role="button"]:not([aria-disabled="true"]):active { transform: scale(0.97); }

  /* Anillo de foco visible solo para navegación por teclado (Tab), no al hacer clic con mouse —
     los inputs/selects ya tienen su propio resalte de borde+sombra de arriba. */
  button:focus-visible, [role="button"]:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 2px solid ${ACCENT};
    outline-offset: 2px;
    border-radius: 6px;
  }
  input:focus-visible, select:focus-visible {
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.5; } }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes rowFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

  .dotPulso {
    width: 6px; height: 6px; border-radius: 999px; background: ${GOOD}; flex-shrink: 0;
    animation: pulse 1s infinite ease-in-out;
  }

  /* Toast único (el más reciente reemplaza al anterior) para todo aviso de "hice esto, lo podés
     deshacer": copiar/pegar días, borrar un vendedor o un local, reiniciar el mes. Antes cada
     acción avisaba a su manera y en su propio lugar de la pantalla (texto suelto debajo de un
     botón, con su propio setTimeout) — juntarlo achica el código y hace que la persona sepa
     siempre dónde mirar.  */
  .toast {
    position: fixed; left: 50%; bottom: 22px; z-index: 40;
    display: flex; align-items: center; gap: 10px;
    background: var(--ink); color: var(--card); font-size: 12.5px; font-weight: 600;
    border-radius: 999px; padding: 10px 10px 10px 16px; box-shadow: 0 10px 30px -8px rgba(0,0,0,0.35);
    animation: toastIn 0.18s ease; max-width: calc(100vw - 32px);
  }
  .vdhApp[data-theme="dark"] .toast { background: #F2F4F1; color: #1B2224; }
  .toast button { flex-shrink: 0; }
  .toast .toastDeshacer { color: #7DD4CE; }
  .vdhApp[data-theme="dark"] .toast .toastDeshacer { color: #2C6E71; }

  /* El acordeón "Configuración del local" y los avisos del panel de horario (feriado, cerrado,
     hueco sin cubrir) aparecían de golpe; con esto entran con una transición corta, no saltan
     el layout de un frame a otro. */
  .acordeonContenido, .avisoDia, .mensajeCopiado { animation: fadeSlideIn 0.15s ease; }
  .rankFila { animation: rowFadeIn 0.2s ease; }

  /* Corte entre un día y el siguiente, como en Google Calendar: cada día ARRANCA con una línea
     de borde y TERMINA con aire libre. Junto con el gap más ancho de la grilla, ese canal queda
     bastante más marcado que la separación entre dos turnos solapados del mismo día (3px), que
     era lo que hacía difícil distinguir dónde terminaba un día y empezaba el otro. */
  .diasGridLineas > * + * { border-left: 1px solid var(--linea-dia); }

  .appGrid { display: flex; flex-direction: column; gap: 12px; }
  .card-izquierda, .card-derecha { display: flex; flex-direction: column; gap: 12px; }

  @media (min-width: 900px) {
    .appGrid {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr) 300px;
      grid-template-areas: "izquierda calendario derecha";
      gap: 16px;
      align-items: start;
    }
    .card-izquierda { grid-area: izquierda; position: sticky; top: 20px; }
    .card-calendario { grid-area: calendario; }
    .card-derecha { grid-area: derecha; position: sticky; top: 20px; }

    /* Con los paneles plegados queda una sola columna y el calendario ocupa todo el ancho. */
    .appGrid.sin-paneles {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "calendario";
    }
  }

  /* Imprimir / guardar como PDF: se aísla la tarjeta del calendario (nombre del local, fecha y
     la grilla) y se oculta todo lo demás (header, navegador, paneles de configuración/reparto,
     botones). El "solo-imprimir" repite adentro el contexto que se pierde al ocultar el header. */
  .solo-imprimir { display: none; }
  @media print {
    /* Sin esto, Chrome/Edge no imprimen los colores de fondo (para ahorrar tinta) y los
       turnos quedan como texto pelado en vez de la franja de color de cada vendedor. */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body, .vdhApp { background: #fff !important; }
    body * { visibility: hidden; }
    .card-calendario, .card-calendario * { visibility: visible; }
    .card-calendario {
      position: absolute; left: 0; top: 0; width: 100% !important;
      box-shadow: none !important;
    }
    .no-imprimir { display: none !important; }
    .solo-imprimir { display: block !important; margin-bottom: 10px; }
    .semanaScrollImprimible { max-height: none !important; overflow: visible !important; }
    .semanaScrollImprimible > div { min-width: 0 !important; }
    /* El encabezado de días "flota" (sticky) al scrollear en pantalla; en una hoja impresa de
       varias páginas eso puede duplicarse o cortarse raro, así que se lo deja fijo en su lugar. */
    .semanaHeaderSticky { position: static !important; }
  }

  /* "Compartir imagen": misma limpieza que Imprimir (ocultar botones, mostrar el encabezado con
     local/fecha, ver el horario completo sin el recorte de alto) pero aplicada un instante antes
     de sacarle la foto con html2canvas, en vez de vía @media print. */
  .card-calendario.capturando-imagen .no-imprimir { display: none !important; }
  .card-calendario.capturando-imagen .solo-imprimir { display: block !important; margin-bottom: 10px; }
  .card-calendario.capturando-imagen .semanaScrollImprimible { max-height: none !important; overflow: visible !important; }
  .card-calendario.capturando-imagen .semanaScrollImprimible > div { min-width: 0 !important; }
  /* html2canvas no siempre respeta bien "position: sticky"; se lo deja fijo en su lugar. */
  .card-calendario.capturando-imagen .semanaHeaderSticky { position: static !important; }
`;
