import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Store,
} from "lucide-react";

const STORAGE_KEY = "vdh-objetivo-calendario"; // fallback localStorage (sin capacidad "db")
const UI_PREFS_KEY = "vdh-objetivo-ui-prefs"; // preferencias locales de navegación (no se comparten)
const TEMA_KEY = "vdh-objetivo-tema";
const DB_DOC_PATH = "app/data"; // documento compartido cuando la capacidad "db" está disponible
const DATA_VERSION = 2;
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
const PALETA_VENDEDORES = [
  "#2C6E71", // teal (acento)
  "#A97A66", // terracota
  "#6C7BA0", // azul grisáceo
  "#B08D3E", // mostaza
  "#5E8C61", // verde salvia
  "#8B5F8C", // ciruela
  "#4C8C97", // turquesa
  "#B0654F", // ladrillo
  "#7A8C4C", // oliva
  "#5F6C8C", // índigo suave
];

const uid = () => Math.random().toString(36).slice(2, 10);
const pad2 = (n) => String(n).padStart(2, "0");
const dateKey = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
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
function nuevoTurnoDefault(local, existentes) {
  const desdeMin = minutosDe(local.horaInicio || "08:00");
  const hastaMin = minutosDe(local.horaFin || "22:00");
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
    if (v.modo !== "calendario") return;
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
    modo: "calendario", // "calendario" | "patron"
    dias: {}, // { "2026-09-05": { turnos: [{inicio:"09:00", fin:"17:00"}, ...] } }
    diasSemana: 5,
    horasDiaPatron: 8,
  };
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

// Migra datos guardados con el formato viejo (día -> horas) al nuevo formato
// (día -> turnos con horario). Decisión: empezar de cero en los días cargados,
// se conserva todo lo demás (locales, vendedores, objetivos).
function migrarDatos(parsed) {
  if (!parsed || !parsed.locales) return defaultSharedData();
  const locales = parsed.locales.map((l) => {
    const yaEsV2 = parsed.version === DATA_VERSION;
    return {
      ...l,
      horaInicio: l.horaInicio || "08:00",
      horaFin: l.horaFin || "22:00",
      diasCerrados: l.diasCerrados || [],
      fechasCerradas: l.fechasCerradas || [],
      vendedores: l.vendedores.map((v, idx) => ({
        ...v,
        color: v.color || PALETA_VENDEDORES[idx % PALETA_VENDEDORES.length],
        dias: yaEsV2 ? v.dias || {} : {},
      })),
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
  const [saved, setSaved] = useState(false);
  const [syncMode, setSyncMode] = useState("local"); // "db" | "local"

  // Estado de navegación y preferencias visuales: de cada persona/dispositivo, no se sincroniza.
  const [localActivoId, setLocalActivoId] = useState(null);
  const [vendedorActivo, setVendedorActivo] = useState(null);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null); // { year, month, day } | null
  const [localOpen, setLocalOpen] = useState(false);
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
      lastWrittenRef.current = serializado;
      try {
        if (syncMode === "db" && dbDocRef.current) {
          await dbDocRef.current.set(sharedData);
        } else {
          localStorage.setItem(STORAGE_KEY, serializado);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 900);
      } catch (e) {
        console.error(e);
      }
    }, 450);
    return () => clearTimeout(saveTimer.current);
  }, [sharedData, loaded, syncMode]);

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

  const updateLocal = (patch) =>
    setSharedData((d) => ({ ...d, locales: d.locales.map((l) => (l.id === local.id ? { ...l, ...patch } : l)) }));

  const updateVendedor = (vid, patch) =>
    updateLocal({ vendedores: local.vendedores.map((v) => (v.id === vid ? { ...v, ...patch } : v)) });

  const toggleDiaCerrado = (wd) => {
    const actuales = local.diasCerrados || [];
    const nuevos = actuales.includes(wd) ? actuales.filter((x) => x !== wd) : [...actuales, wd];
    updateLocal({ diasCerrados: nuevos });
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

  const addVendedor = () => {
    const nv = defaultVendedor("", local.vendedores.length);
    updateLocal({ vendedores: [...local.vendedores, nv] });
    setVendedorActivo(nv.id);
  };
  const removeVendedor = (vid) => {
    const restantes = local.vendedores.filter((v) => v.id !== vid);
    updateLocal({ vendedores: restantes });
    if (vendedorActivo === vid) setVendedorActivo(restantes[0]?.id || null);
  };

  const addLocal = () => {
    const nl = defaultLocal("Nuevo local");
    setSharedData((d) => ({ ...d, locales: [...d.locales, nl] }));
    setLocalActivoId(nl.id);
    setVendedorActivo(nl.vendedores[0].id);
    setFechaSeleccionada(null);
  };
  const switchLocal = (l) => {
    setLocalActivoId(l.id);
    setVendedorActivo(l.vendedores[0]?.id || null);
    setFechaSeleccionada(null);
  };
  const removeLocal = (lid) => {
    if (sharedData.locales.length <= 1) return;
    const locales = sharedData.locales.filter((l) => l.id !== lid);
    setSharedData((d) => ({ ...d, locales }));
    if (localActivoId === lid) {
      setLocalActivoId(locales[0].id);
      setVendedorActivo(locales[0].vendedores[0]?.id || null);
    }
    setFechaSeleccionada(null);
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
      if (dias[nuevaKey] !== undefined) return; // no pisa días que ya cargaste este mes
      dias[nuevaKey] = { turnos: (diaObj.turnos || []).map((t) => ({ ...t })) };
      copiados++;
    });
    if (copiados > 0) updateVendedor(v.id, { dias });
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
      const wd = new Date(year, month - 1, d).getDay();
      const patron = patronPorDiaSemana[wd];
      if (patron) {
        dias[key] = { turnos: (patron.turnos || []).map((t) => ({ ...t })) };
        copiados++;
      }
    }
    if (copiados > 0) updateVendedor(v.id, { dias });
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
      const origen = v.dias[keyAnterior];
      if (origen && origen.turnos && origen.turnos.length) {
        dias[keyActual] = { turnos: origen.turnos.map((t) => ({ ...t })) };
        copiados++;
      }
    }
    if (copiados > 0) updateVendedor(v.id, { dias });
    return copiados;
  };

  const resetMes = () => {
    updateLocal({
      vendedores: local.vendedores.map((v) => {
        const dias = { ...v.dias };
        Object.keys(dias).forEach((k) => {
          if (k.startsWith(prefix)) delete dias[k];
        });
        return { ...v, dias };
      }),
    });
    setFechaSeleccionada(null);
  };

  // Cálculos
  function horasDeVendedor(v) {
    if (v.modo === "patron") {
      return (Number(v.diasSemana) || 0) * (Number(v.horasDiaPatron) || 0) * 4.345;
    }
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
  const pctTotal = filas.reduce((s, f) => s + f.pct, 0);
  const montoTotal = filas.reduce((s, f) => s + f.monto, 0);

  const vActivo = local.vendedores.find((v) => v.id === vendedorActivo) || local.vendedores[0];

  const fechaDiaVista = fechaSeleccionada || hoyComoFecha();
  const diasGrilla = vista === "semana"
    ? diasDeLaSemana(semanaInicio)
    : [new Date(fechaDiaVista.year, fechaDiaVista.month - 1, fechaDiaVista.day)];

  return (
    <div className="vdhApp" data-theme={tema} style={S.page}>
      <style>{CSS}</style>

      {/* Header: compacto, todo en una fila, para dejarle más lugar al calendario */}
      <div style={S.headerBand}>
        <div style={S.logoRow}>
          <div style={S.logoMark}>VDH</div>
          <div>
            <div style={S.brandTitle}>Objetivo VDH</div>
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
              onClick={() => setTema((t) => (t === "dark" ? "light" : "dark"))}
              style={S.temaBtn}
              title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {tema === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
          <div style={{ ...S.savedPill, opacity: saved ? 1 : 0.001 }}>
            <Check size={11} strokeWidth={3} />
            <span>Guardado</span>
          </div>
        </div>
      </div>

      {/* Navegador de mes/semana/día */}
      <ViewNav
        vista={vista} mesVista={mesVista} semanaInicio={semanaInicio} fechaSeleccionada={fechaDiaVista}
        onPrev={navPrev} onNext={navNext} onHoy={irAHoy}
      />

      <div className="appGrid">
        {/* Columna izquierda: configuración y edición */}
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
                  style={v.id === vActivo?.id ? { ...S.chipActiveAccent, background: v.color } : S.chip}
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

        {/* Columna central: calendario, grande */}
        <div className="card-calendario">
          <div style={S.card}>
            <div style={S.rowBetween}>
              <div>
                <div style={S.sectionTitle}>Calendario de horarios</div>
                <div style={S.miniStat}>
                  {vista === "mes" ? "Tocá un día para cargar el horario del vendedor seleccionado" : "Tocá un turno para editarlo, o el espacio vacío para elegir el día"}
                </div>
              </div>
              <div style={S.vistaSwitchRow}>
                <button onClick={() => cambiarVista("mes")} style={vista === "mes" ? S.vistaBtnActive : S.vistaBtn}>Mes</button>
                <button onClick={() => cambiarVista("semana")} style={vista === "semana" ? S.vistaBtnActive : S.vistaBtn}>Semana</button>
                <button onClick={() => cambiarVista("dia")} style={vista === "dia" ? S.vistaBtnActive : S.vistaBtn}>Día</button>
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
                />
              ) : (
                <GrillaSemana
                  dias={diasGrilla}
                  vendedores={local.vendedores}
                  local={local}
                  fechaSeleccionada={fechaSeleccionada}
                  onSelectFecha={setFechaSeleccionada}
                  onSelectVendedor={setVendedorActivo}
                />
              )}
            </div>
            <div style={S.legendRow}>
              {local.vendedores.map((v) => (
                <span key={v.id} style={S.legendChip}>
                  <span style={{ ...S.legendDot, background: v.color }} />
                  {v.nombre || "Sin nombre"}
                </span>
              ))}
              <span style={S.legendChip}>
                <span style={S.gapDot} />
                Hueco sin cubrir
              </span>
              <span style={S.legendChip}>
                <span style={S.feriadoDot} />
                Feriado nacional
              </span>
            </div>
          </div>
        </div>

        {/* Columna derecha: horario del día seleccionado + reparto del mes */}
        <div className="card-derecha">
          <TurnoEditorCard
            vendedor={vActivo}
            vendedores={local.vendedores}
            local={local}
            fecha={fechaSeleccionada}
            onCambiarFecha={setFechaSeleccionada}
            onSetTurnos={(turnos) => setTurnosDia(vActivo, fechaSeleccionada, turnos)}
            onQuitarDia={() => quitarDiaVendedor(vActivo, fechaSeleccionada)}
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
                  <div key={f.id} style={i === 0 ? S.rankCardTop : S.rankCard}>
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
      </div>
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

// Calendario mensual: para TODOS los vendedores del local, un resumen compacto de los turnos
// cargados cada día (nombre + horario, con una tira fina proporcional al horario del local
// debajo). Marca el día actual, los días cerrados (fijos o feriados) y los huecos de cobertura.
function SharedCalendar({ year, month, nDias, leadBlanks, prefix, vendedores, local, fechaSeleccionada, onSelectFecha }) {
  const feriados = feriadosArgentina(year);
  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(<div key={"b" + i} />);
  for (let d = 1; d <= nDias; d++) {
    const key = dateKey(year, month, d);
    const cerrado = estaCerrado(local, year, month, d);
    const feriado = feriados[key];
    const entradas = vendedores
      .filter((v) => v.modo === "calendario")
      .map((v) => ({ v, dia: v.dias[key] }))
      .filter((x) => x.dia && x.dia.turnos && x.dia.turnos.length > 0);
    const visibles = entradas.slice(0, 4);
    const resto = entradas.length - visibles.length;
    const seleccionado = !!fechaSeleccionada && fechaSeleccionada.year === year && fechaSeleccionada.month === month && fechaSeleccionada.day === d;
    const hoy = esHoy(year, month, d);
    const tieneHueco = !cerrado && huecosDelDia(vendedores, key, local.horaInicio, local.horaFin).length > 0;

    let cellStyle = S.dayCell;
    if (seleccionado) cellStyle = S.dayCellSelected;
    else if (cerrado) cellStyle = S.dayCellCerrado;
    else if (hoy) cellStyle = S.dayCellHoy;

    cells.push(
      <button key={d} onClick={() => onSelectFecha({ year, month, day: d })} style={cellStyle} title={feriado || undefined}>
        <span style={cerrado ? S.dayNumRowCerrado : hoy ? S.dayNumRowHoy : S.dayNumRow}>
          {d}
          {feriado && <span style={S.feriadoDot} />}
          {tieneHueco && <span style={S.gapDot} />}
        </span>
        {cerrado && visibles.length === 0 && <span style={S.cerradoLabel}>Cerrado</span>}
        {!cerrado && feriado && visibles.length === 0 && <span style={S.feriadoLabel}>{feriado}</span>}
        {visibles.map(({ v, dia }) => {
          const primerNombre = (v.nombre || "Sin nombre").split(" ")[0];
          return (
            <span
              key={v.id}
              style={{ ...S.turnoTextLabel, color: v.color }}
              title={`${v.nombre || "Sin nombre"}: ${fmtResumenDia(dia)}`}
            >
              {primerNombre} {fmtResumenDia(dia)}
            </span>
          );
        })}
        {resto > 0 && <span style={S.moreBadge}>+{resto} más</span>}
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
function GrillaSemana({ dias, vendedores, local, fechaSeleccionada, onSelectFecha, onSelectVendedor }) {
  const feriadosPorAnio = {};
  const getFeriados = (y) => feriadosPorAnio[y] || (feriadosPorAnio[y] = feriadosArgentina(y));

  const desdeMin = minutosDe(local.horaInicio);
  const hastaMin = minutosDe(local.horaFin);
  const rango = Math.max(60, hastaMin - desdeMin);
  const PX_POR_HORA = 56;
  const alturaTotal = (rango / 60) * PX_POR_HORA;

  const horas = [];
  for (let m = Math.ceil(desdeMin / 60) * 60; m <= hastaMin; m += 60) horas.push(m);

  const anchoMin = dias.length * 108 + 46;

  return (
    <div style={S.semanaScroll}>
      <div style={{ minWidth: anchoMin }}>
        <div style={{ display: "flex" }}>
          <div style={S.semanaAxisSpacer} />
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${dias.length}, 1fr)`, flex: 1, gap: 2 }}>
            {dias.map((fecha, i) => {
              const y = fecha.getFullYear(), m = fecha.getMonth() + 1, d = fecha.getDate();
              const key = dateKey(y, m, d);
              const hoy = esHoy(y, m, d);
              const sel = !!fechaSeleccionada && fechaSeleccionada.year === y && fechaSeleccionada.month === m && fechaSeleccionada.day === d;
              const feriado = getFeriados(y)[key];
              let estilo = S.semanaDiaHeader;
              if (sel) estilo = S.semanaDiaHeaderSel;
              else if (hoy) estilo = S.semanaDiaHeaderHoy;
              return (
                <button key={i} onClick={() => onSelectFecha({ year: y, month: m, day: d })} style={estilo} title={feriado || undefined}>
                  <span style={S.semanaDiaHeaderNombre}>{DIAS_SEMANA_LARGO[fecha.getDay()].slice(0, 3)}</span>
                  <span style={S.semanaDiaHeaderNum}>{d}{feriado && <span style={S.feriadoDot} />}</span>
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
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${dias.length}, 1fr)`, flex: 1, gap: 2, position: "relative" }}>
            {dias.map((fecha, i) => {
              const y = fecha.getFullYear(), m = fecha.getMonth() + 1, d = fecha.getDate();
              const key = dateKey(y, m, d);
              const cerrado = estaCerrado(local, y, m, d);
              const eventos = [];
              vendedores.filter((v) => v.modo === "calendario").forEach((v) => {
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
                  {dispuestos.map((ev) => {
                    const top = ((ev.inicioMin - desdeMin) / rango) * alturaTotal;
                    const alto = Math.max(20, ((ev.finMin - ev.inicioMin) / rango) * alturaTotal);
                    const left = (ev.col / ev.totalCols) * 100;
                    const ancho = 100 / ev.totalCols;
                    return (
                      <button
                        key={ev.vId + "-" + ev.idx}
                        onClick={(e) => { e.stopPropagation(); onSelectFecha({ year: y, month: m, day: d }); onSelectVendedor(ev.vId); }}
                        style={{ ...S.semanaEvento, top, height: alto, left: `${left}%`, width: `calc(${ancho}% - 3px)`, background: ev.color }}
                        title={`${ev.nombre || "Sin nombre"}: ${fmtHoraCorta(minAHHMM(ev.inicioMin))}-${fmtHoraCorta(minAHHMM(ev.finMin))}`}
                      >
                        <span style={S.semanaEventoNombre}>{ev.nombre || "Sin nombre"}</span>
                        {alto >= 34 && (
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
  const [msg, setMsg] = useState("");

  const handleCopiar = () => {
    const n = onCopiarMesAnterior();
    setMsg(n > 0 ? `Se copiaron ${n} días del mes anterior` : "No hay días el mes pasado para copiar");
    setTimeout(() => setMsg(""), 2500);
  };
  const handleRepetir = () => {
    const n = onRepetirSemana();
    setMsg(n > 0 ? `Se repitieron ${n} días según la primera semana` : "Cargá al menos un día en la primera semana (1 al 7) para repetir");
    setTimeout(() => setMsg(""), 2500);
  };
  const handleCopiarSemana = () => {
    const n = onCopiarSemanaAnterior();
    setMsg(n > 0 ? `Se copiaron ${n} días de la semana anterior` : "No hay datos la semana anterior para copiar");
    setTimeout(() => setMsg(""), 2500);
  };

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

      <div style={S.modeRow}>
        <button
          onClick={() => onChange({ modo: "calendario" })}
          style={v.modo === "calendario" ? S.modeBtnActive : S.modeBtn}
        >Calendario</button>
        <button
          onClick={() => onChange({ modo: "patron" })}
          style={v.modo === "patron" ? S.modeBtnActive : S.modeBtn}
        >Patrón rápido</button>
      </div>

      {v.modo === "calendario" ? (
        <>
          <div style={S.miniStat}>{diasMarcados} días marcados · {fmt(horasCalc, 1)} hs este mes</div>
          <div style={S.rowBetween3}>
            <button onClick={handleCopiar} style={S.copyBtn}>Copiar mes anterior</button>
            <button onClick={handleRepetir} style={S.copyBtn}>Repetir 1ª semana</button>
            <button onClick={handleCopiarSemana} style={S.copyBtn}>Copiar semana anterior</button>
          </div>
          {msg && <div style={S.copiadoMsg}>{msg}</div>}
        </>
      ) : (
        <div style={S.twoCol}>
          <label style={S.field}>
            <span style={S.label}>Días por semana</span>
            <input type="number" min="0" max="7" value={v.diasSemana}
              onChange={(e) => onChange({ diasSemana: e.target.value })} style={S.input} />
          </label>
          <label style={S.field}>
            <span style={S.label}>Horas por día</span>
            <input type="number" min="0" step="0.5" value={v.horasDiaPatron}
              onChange={(e) => onChange({ horasDiaPatron: e.target.value })} style={S.input} />
          </label>
        </div>
      )}
    </div>
  );
}

// Panel de edición del horario del vendedor seleccionado, para la fecha elegida en el calendario.
// El aviso de huecos y el resumen del día consideran a TODOS los vendedores, no solo al activo.
function TurnoEditorCard({ vendedor, vendedores, local, fecha, onCambiarFecha, onSetTurnos, onQuitarDia }) {
  if (!vendedor) return null;

  const cambiarDia = (delta) => {
    const base = fecha || hoyComoFecha();
    const d = sumarDias(new Date(base.year, base.month - 1, base.day), delta);
    onCambiarFecha({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  };

  const cerrado = fecha ? estaCerrado(local, fecha.year, fecha.month, fecha.day) : false;
  const feriado = fecha ? feriadosArgentina(fecha.year)[dateKey(fecha.year, fecha.month, fecha.day)] : null;
  const huecos = fecha && !cerrado
    ? huecosDelDia(vendedores, dateKey(fecha.year, fecha.month, fecha.day), local.horaInicio, local.horaFin)
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

      {fecha && (() => {
        const key = dateKey(fecha.year, fecha.month, fecha.day);
        const calendario = vendedores.filter((v) => v.modo === "calendario");
        const conHorario = calendario.filter((v) => v.dias[key]?.turnos?.length);
        const sinHorario = calendario.filter((v) => !v.dias[key]?.turnos?.length);
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
        <div style={S.notePlain}>📅 Feriado nacional: {feriado}</div>
      )}

      {cerrado && (
        <div style={S.notePlain}>Este día el local figura cerrado. Igual podés cargar un horario si hace falta (ej. reposición).</div>
      )}

      {huecos.length > 0 && (
        <div style={S.gapWarning}>
          ⚠ Sin cobertura de nadie: {huecos.map((h) => `${h.inicio}–${h.fin}`).join(", ")}
        </div>
      )}

      {vendedor.modo !== "calendario" ? (
        <div style={S.note}>Este vendedor usa "Patrón rápido" — su horario no se carga por calendario.</div>
      ) : !fecha ? (
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
  const key = dateKey(fecha.year, fecha.month, fecha.day);
  const turnos = vendedor.dias[key]?.turnos || [];
  const opciones = generarOpcionesHora(local.horaInicio, local.horaFin);
  const opcionesInicio = opciones.length > 1 ? opciones.slice(0, -1) : opciones;

  const setTurno = (idx, campo, valor) => {
    const nuevos = turnos.map((t, i) => {
      if (i !== idx) return t;
      if (campo === "inicio") {
        // El fin siempre tiene que quedar después del inicio: si el nuevo inicio
        // alcanza o supera el fin actual, corremos el fin hacia adelante.
        let fin = t.fin;
        if (minutosDe(valor) >= minutosDe(fin)) {
          fin = minAHHMM(Math.min(minutosDe(valor) + 30, minutosDe(local.horaFin)));
        }
        return { ...t, inicio: valor, fin };
      }
      return { ...t, fin: valor };
    });
    onSetTurnos(nuevos);
  };
  const agregarBloque = () => {
    if (turnos.length >= 2) return;
    onSetTurnos([...turnos, nuevoTurnoDefault(local, turnos)]);
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
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
    padding: "24px 20px 48px", maxWidth: 1460, margin: "0 auto",
  },
  loadingWrap: { minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" },
  loadingDot: { width: 10, height: 10, borderRadius: 99, background: ACCENT, animation: "pulse 1s infinite ease-in-out" },
  headerBand: {
    background: CARD, borderRadius: 16, padding: "9px 12px", marginBottom: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -12px rgba(0,0,0,0.08)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
  },
  headerRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 },
  headerRightRow: { display: "flex", alignItems: "center", gap: 8 },
  logoRow: { display: "flex", alignItems: "center", gap: 7 },
  logoMark: {
    width: 26, height: 26, borderRadius: 7, background: ACCENT, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, letterSpacing: "-0.02em",
    flexShrink: 0,
  },
  brandTitle: { fontSize: 13.5, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.1, color: INK },
  brandSubtitle: { fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", color: SUB, marginTop: 0 },
  savedPill: {
    display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700,
    color: GOOD, transition: "opacity 0.5s ease",
  },
  syncBadgeOn: { fontSize: 9.5, fontWeight: 700, color: ACCENT },
  syncBadgeOff: { fontSize: 9.5, fontWeight: 700, color: SUB },
  temaBtn: {
    width: 22, height: 22, borderRadius: 999, border: "none", background: "transparent",
    fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  },
  localDropdownWrap: { position: "relative", flex: "1 1 220px", maxWidth: 340, minWidth: 160 },
  localDropdownBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    background: BG, border: `1px solid ${LINE}`, borderRadius: 10, padding: "7px 11px",
    cursor: "pointer",
  },
  localDropdownText: { fontSize: 13.5, fontWeight: 700, color: INK },
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
    display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: SUB,
    background: "transparent", border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left",
    borderTop: `1px solid ${LINE}`, marginTop: 2,
  },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  chip: {
    fontSize: 12.5, fontWeight: 600, color: SUB, background: CARD, border: `1px solid ${LINE}`,
    borderRadius: 999, padding: "7px 12px", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  },
  chipActiveAccent: {
    fontSize: 12.5, fontWeight: 700, color: "#fff", border: "none",
    borderRadius: 999, padding: "7px 12px", whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  },
  chipDot: { width: 7, height: 7, borderRadius: 99, flexShrink: 0, display: "inline-block" },
  card: {
    background: CARD, borderRadius: 18, padding: 15,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 20px -12px rgba(0,0,0,0.08)",
  },
  rowBetween: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  nameInput: { fontSize: 16, fontWeight: 700, border: "none", background: "transparent", outline: "none", color: INK, flex: 1 },
  nameInputSm: {
    fontSize: 14, fontWeight: 700, color: INK, flex: 1, outline: "none",
    border: `1.5px solid ${LINE}`, borderRadius: 9, background: SURFACE_INPUT,
    padding: "8px 10px",
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: SUB, fontWeight: 600 },
  input: {
    border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 14,
    color: INK, background: SURFACE_INPUT, outline: "none", width: "100%", boxSizing: "border-box",
  },
  iconGhost: {
    width: 28, height: 28, borderRadius: 8, border: "none", background: DANGER_BG, color: DANGER,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: INK },
  addBtn: {
    display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "#fff",
    background: ACCENT, border: "none", borderRadius: 10, padding: "7px 11px", cursor: "pointer",
  },
  smallGhostBtn: {
    fontSize: 11.5, fontWeight: 600, color: SUB, background: SURFACE_2, border: "none",
    borderRadius: 8, padding: "7px 10px", cursor: "pointer",
  },
  miniStat: { fontSize: 11.5, color: SUB, fontWeight: 600, marginTop: 4 },
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
    fontSize: 11.5, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, border: "none",
    borderRadius: 999, padding: "6px 13px", cursor: "pointer", marginLeft: 4,
  },
  monthLabel: { fontSize: 14, fontWeight: 700, minWidth: 120, textAlign: "center", color: INK },
  vistaSwitchRow: { display: "flex", gap: 4, flexShrink: 0 },
  vistaBtn: {
    fontSize: 11.5, fontWeight: 700, color: SUB, background: SURFACE_2, border: "none",
    borderRadius: 8, padding: "6px 10px", cursor: "pointer",
  },
  vistaBtnActive: {
    fontSize: 11.5, fontWeight: 700, color: "#fff", background: ACCENT, border: "none",
    borderRadius: 8, padding: "6px 10px", cursor: "pointer",
  },
  weekHeader: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 },
  weekHeaderCell: { fontSize: 10.5, color: SUB, fontWeight: 700, textAlign: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 },
  dayCell: {
    minHeight: 86, border: "none", borderRadius: 10, background: SURFACE_2, color: INK,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "5px 4px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayCellSelected: {
    minHeight: 86, border: `1.5px solid ${ACCENT}`, borderRadius: 10, background: ACCENT_SOFT, color: INK,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "4.5px 3.5px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayCellHoy: {
    minHeight: 86, border: `1.5px solid ${ACCENT}`, borderRadius: 10, background: SURFACE_2, color: INK,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "4.5px 3.5px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayCellCerrado: {
    minHeight: 86, border: "none", borderRadius: 10, color: SUB,
    background: `repeating-linear-gradient(135deg, ${SURFACE_2}, ${SURFACE_2} 6px, transparent 6px, transparent 12px), ${CARD}`,
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch",
    justifyContent: "flex-start", padding: "5px 4px", gap: 3, textAlign: "left", boxSizing: "border-box",
  },
  dayNumRow: { fontSize: 11, fontWeight: 700, color: INK, padding: "0 2px", display: "flex", alignItems: "center", gap: 3 },
  dayNumRowHoy: { fontSize: 11, fontWeight: 800, color: ACCENT, padding: "0 2px", display: "flex", alignItems: "center", gap: 3 },
  dayNumRowCerrado: { fontSize: 11, fontWeight: 700, color: SUB, padding: "0 2px", display: "flex", alignItems: "center", gap: 3 },
  cerradoLabel: { fontSize: 8.5, fontWeight: 700, color: SUB, padding: "0 2px" },
  feriadoDot: { width: 5, height: 5, borderRadius: 99, background: "var(--feriado)", flexShrink: 0, display: "inline-block" },
  feriadoLabel: { fontSize: 8.5, fontWeight: 700, color: "var(--feriado)", padding: "0 2px" },
  turnoTextLabel: {
    display: "block", width: "100%", flexShrink: 0,
    fontSize: 9, fontWeight: 700, lineHeight: 1.35,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  moreBadge: { fontSize: 8, fontWeight: 700, color: SUB, padding: "0 3px" },
  gapDot: { width: 5, height: 5, borderRadius: 99, background: WARN, flexShrink: 0, display: "inline-block" },
  gapWarning: {
    fontSize: 11.5, fontWeight: 600, color: WARN, background: WARN_BG, borderRadius: 9,
    padding: "8px 10px", marginBottom: 10, lineHeight: 1.4,
  },
  legendRow: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` },
  legendChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: SUB },
  legendDot: { width: 8, height: 8, borderRadius: 99, flexShrink: 0, display: "inline-block" },
  modeRow: { display: "flex", gap: 6, marginBottom: 10 },
  modeBtn: {
    flex: 1, fontSize: 12, fontWeight: 600, color: SUB, background: SURFACE_2, border: "none",
    borderRadius: 9, padding: "7px 0", cursor: "pointer",
  },
  modeBtnActive: {
    flex: 1, fontSize: 12, fontWeight: 700, color: "#fff", background: ACCENT, border: "none",
    borderRadius: 9, padding: "7px 0", cursor: "pointer",
  },
  rowBetween3: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  copyBtn: {
    fontSize: 11, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, border: "none",
    borderRadius: 7, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap",
  },
  copiadoMsg: { fontSize: 11, color: ACCENT, fontWeight: 600, marginTop: 6 },
  note: { fontSize: 11.5, color: DANGER, lineHeight: 1.4 },
  notePlain: { fontSize: 11.5, color: SUB, lineHeight: 1.4, marginBottom: 10 },
  eyebrowLine: { fontSize: 10.5, fontWeight: 700, color: SUB, marginBottom: 2 },
  turnoEditorTitle: { display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 700, color: INK },
  diaResumenBlock: {
    display: "flex", flexDirection: "column", gap: 5, background: SURFACE_2, borderRadius: 10,
    padding: "8px 10px", marginBottom: 10,
  },
  diaResumenRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 },
  diaResumenNombre: { fontWeight: 700, color: INK, flexShrink: 0 },
  diaResumenHoras: { color: SUB, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  diaResumenSinHorario: { fontSize: 10.5, color: SUB, fontWeight: 600, marginTop: 4, paddingTop: 5, borderTop: `1px solid ${LINE}` },
  notePlainSinMargen: { fontSize: 11.5, color: SUB, lineHeight: 1.4 },
  dayNavRow: { display: "flex", alignItems: "center", gap: 6 },
  dayNavLabel: { fontSize: 11.5, fontWeight: 700, color: INK, minWidth: 56, textAlign: "center" },
  turnoRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  turnoSelect: {
    flex: 1, border: `1px solid ${LINE}`, borderRadius: 9, padding: "8px 6px", fontSize: 13,
    color: INK, background: SURFACE_INPUT, outline: "none", minWidth: 0,
  },
  turnoA: { fontSize: 11.5, color: SUB, fontWeight: 600, flexShrink: 0 },
  rankList: { display: "flex", flexDirection: "column", gap: 8 },
  rankCard: {
    display: "flex", alignItems: "center", gap: 10, background: BG, borderRadius: 14, padding: "10px 12px",
  },
  rankCardTop: {
    display: "flex", alignItems: "center", gap: 10, background: ACCENT_SOFT, borderRadius: 14, padding: "10px 12px",
    border: `1.5px solid ${ACCENT}`,
  },
  rankBadge: { width: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rankDot: { width: 10, height: 10, borderRadius: 99, flexShrink: 0, display: "inline-block" },
  rankInfo: { flex: 1, minWidth: 0 },
  rankName: { fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  rankSub: { fontSize: 11, color: SUB, fontWeight: 500, marginTop: 1 },
  rankRight: { textAlign: "right", flexShrink: 0 },
  rankPct: { fontSize: 15, fontWeight: 800, color: INK },
  rankMoney: { fontSize: 10.5, color: SUB, fontWeight: 600, marginTop: 1 },
  rowBetween2: {
    display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10,
    borderTop: `1px solid ${LINE}`,
  },
  miniStatStrong: { fontSize: 12.5, fontWeight: 800, color: INK },
  cerradosBlock: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` },
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
    width: 16, height: 16, borderRadius: 99, border: "none", background: "transparent", color: SUB,
    fontSize: 13, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  semanaScroll: { overflowX: "auto", WebkitOverflowScrolling: "touch" },
  semanaAxisSpacer: { width: 42, flexShrink: 0 },
  semanaAxis: { width: 42, flexShrink: 0, position: "relative" },
  semanaHoraLabel: {
    position: "absolute", right: 6, transform: "translateY(-50%)",
    fontSize: 9.5, color: SUB, fontWeight: 600, whiteSpace: "nowrap",
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
  semanaDiaCol: { position: "relative", borderLeft: `1px solid ${LINE}`, cursor: "pointer" },
  semanaDiaColCerrado: {
    background: `repeating-linear-gradient(135deg, ${SURFACE_2}, ${SURFACE_2} 6px, transparent 6px, transparent 12px)`,
  },
  semanaGridLine: { position: "absolute", left: 0, right: 0, borderTop: `1px solid ${LINE}`, pointerEvents: "none" },
  semanaAhora: { position: "absolute", left: 0, right: 0, height: 2, background: "#E0524A", zIndex: 5, pointerEvents: "none" },
  semanaAhoraDot: { position: "absolute", left: -3, top: -3, width: 8, height: 8, borderRadius: 99, background: "#E0524A" },
  semanaEvento: {
    position: "absolute", borderRadius: 6, padding: "3px 6px", color: "#fff", border: "none",
    cursor: "pointer", overflow: "hidden", textAlign: "left", display: "flex", flexDirection: "column",
    boxSizing: "border-box",
  },
  semanaEventoNombre: { fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  semanaEventoHora: { fontSize: 9, fontWeight: 600, opacity: 0.9 },
};

const CSS = `
  .vdhApp {
    --accent: #2C6E71;
    --accent-soft: #E3EFEE;
    --ink: #232823;
    --sub: #8C9089;
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
  }
  .vdhApp[data-theme="dark"] {
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
  }

  * { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: var(--line); border-radius: 99px; }
  *::-webkit-scrollbar-thumb:hover { background: var(--sub); }

  input:focus, select:focus { outline: none; }
  input[style*="border"]:focus, select[style*="border"]:focus { border-color: ${ACCENT} !important; }
  button { -webkit-tap-highlight-color: transparent; }
  @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.5; } }

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
  }
`;
