'use strict';
/*
  Dominio de reservas: SOLO funciones puras (sin E/S, sin mutar argumentos).
  Una reserva ocupa "bloques" de 30 min (enteros = epoch / 30 min). Dos
  reservas de la misma sala chocan si comparten algún bloque; esto permite
  detectar solapamientos en memoria y garantizarlos con un índice único en BD.
 */
const { ReglaNegocioError, ConflictoError } = require('../errors');

const BLOQUE_MS = 30 * 60 * 1000;
const MAX_BLOQUES = 8; // 4 horas
const ESTADOS = Object.freeze(['activa', 'cancelada']);

const normalizarTexto = (t) => String(t).trim().replace(/\s+/g, ' ');
const normalizarSala = (s) => String(s).trim().toUpperCase();

/** Lista de bloques [inicio, fin). Precondición: ambos extremos alineados. */
function calcularBloques(inicio, fin) {
  const desde = inicio.getTime() / BLOQUE_MS;
  const hasta = fin.getTime() / BLOQUE_MS;
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || hasta <= desde) {
    throw new RangeError('Rango no alineado a bloques de 30 minutos');
  }
  return Array.from({ length: hasta - desde }, (_, i) => desde + i);
}

function validarRango(inicio, fin, ahora, { exigirFuturo = true } = {}) {
  const detalles = [];
  if (inicio.getTime() % BLOQUE_MS !== 0) {
    detalles.push({ campo: 'inicio', mensaje: 'inicio debe estar en hora en punto o y media' });
  }
  if (fin.getTime() % BLOQUE_MS !== 0) {
    detalles.push({ campo: 'fin', mensaje: 'fin debe estar en hora en punto o y media' });
  }
  if (!(inicio < fin)) {
    detalles.push({ campo: 'fin', mensaje: 'fin debe ser posterior a inicio' });
  } else if ((fin - inicio) / BLOQUE_MS > MAX_BLOQUES) {
    detalles.push({ campo: 'fin', mensaje: 'la duración máxima de una reserva es de 4 horas' });
  }
  if (exigirFuturo && inicio <= ahora) {
    detalles.push({ campo: 'inicio', mensaje: 'inicio debe ser una fecha futura' });
  }
  if (detalles.length > 0) {
    throw new ReglaNegocioError('La reserva incumple las reglas de negocio', detalles);
  }
}

/** Entrada validada -> datos listos para persistir. */
function crearDatosReserva(entrada, ahora) {
  const inicio = new Date(entrada.inicio);
  const fin = new Date(entrada.fin);
  validarRango(inicio, fin, ahora);
  return Object.freeze({
    sala: normalizarSala(entrada.sala),
    solicitante: normalizarTexto(entrada.solicitante),
    motivo: normalizarTexto(entrada.motivo),
    inicio,
    fin,
    estado: 'activa',
    adjunto: null,
    bloques: calcularBloques(inicio, fin),
  });
}

/** PUT: devuelve solo los campos que cambian; no muta `actual`. */
function reemplazarDatos(actual, entrada, ahora) {
  if (actual.estado !== 'activa') {
    throw new ConflictoError('No se puede modificar una reserva cancelada');
  }
  const inicio = new Date(entrada.inicio);
  const fin = new Date(entrada.fin);
  const cambioInicio = inicio.getTime() !== actual.inicio.getTime();
  validarRango(inicio, fin, ahora, { exigirFuturo: cambioInicio });
  return {
    sala: normalizarSala(entrada.sala),
    solicitante: normalizarTexto(entrada.solicitante),
    motivo: normalizarTexto(entrada.motivo),
    inicio,
    fin,
    bloques: calcularBloques(inicio, fin),
  };
}

function cancelarDatos(actual, ahora) {
  if (actual.estado === 'cancelada') {
    throw new ConflictoError('La reserva ya está cancelada');
  }
  if (actual.fin <= ahora) {
    throw new ReglaNegocioError('No se puede cancelar una reserva finalizada', [
      { campo: 'fin', mensaje: 'la reserva ya finalizó' },
    ]);
  }
  return { estado: 'cancelada', bloques: [] };
}

/* ---------- Archivos adjuntos (puras) ---------- */

const FIRMAS = [
  { mime: 'application/pdf', ext: '.pdf', firma: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/png', ext: '.png', firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', ext: '.jpg', firma: [0xff, 0xd8, 0xff] },
];

/** Detecta el tipo real por "magic bytes"; ignora el mimetype que declara el cliente. */
function detectarTipoArchivo(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const hallado = FIRMAS.find(({ firma }) => firma.every((b, i) => buffer[i] === b));
  return hallado ? { mime: hallado.mime, ext: hallado.ext } : null;
}

function sanitizarNombreArchivo(nombre) {
  const limpio = String(nombre ?? '')
    .replace(/[\\/]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 100);
  return limpio || 'adjunto';
}

/* ---------- Consulta y presentación (puras) ---------- */

const esTexto = (v) => typeof v === 'string';

function construirFiltroListado(consulta = {}) {
  const filtro = {};
  if (esTexto(consulta.sala)) filtro.sala = normalizarSala(consulta.sala);
  if (esTexto(consulta.estado) && ESTADOS.includes(consulta.estado)) filtro.estado = consulta.estado;
  if (consulta.desde instanceof Date) filtro.desde = consulta.desde;
  if (consulta.hasta instanceof Date) filtro.hasta = consulta.hasta;
  return filtro;
}

function normalizarPaginacion({ pagina, limite } = {}) {
  const p = Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
  const l = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 100) : 20;
  return { pagina: p, limite: l };
}

/** Entidad interna -> JSON público (oculta bloques y nombre físico del archivo). */
function aVista(r) {
  return {
    id: r.id,
    sala: r.sala,
    solicitante: r.solicitante,
    motivo: r.motivo,
    inicio: r.inicio.toISOString(),
    fin: r.fin.toISOString(),
    estado: r.estado,
    version: r.version,
    adjunto: r.adjunto
      ? {
          nombreOriginal: r.adjunto.nombreOriginal,
          mime: r.adjunto.mime,
          tamano: r.adjunto.tamano,
          url: `/api/v1/reservas/${r.id}/adjunto`,
        }
      : null,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString(),
  };
}

module.exports = {
  BLOQUE_MS, MAX_BLOQUES, ESTADOS,
  calcularBloques, validarRango, crearDatosReserva, reemplazarDatos, cancelarDatos,
  detectarTipoArchivo, sanitizarNombreArchivo,
  construirFiltroListado, normalizarPaginacion, aVista,
};
