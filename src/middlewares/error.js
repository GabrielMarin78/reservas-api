'use strict';
const { AppError, NoEncontradoError, ValidacionError } = require('../errors');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Pura: cualquier error -> { estado, codigo, mensaje, detalles }. */
function normalizarError(err) {
  if (err instanceof AppError) {
    return { estado: err.estado, codigo: err.codigo, mensaje: err.message, detalles: err.detalles };
  }
  if (err?.type === 'entity.parse.failed') {
    return { estado: 400, codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es JSON válido', detalles: [] };
  }
  if (err?.type === 'entity.too.large') {
    return { estado: 413, codigo: 'CUERPO_MUY_GRANDE', mensaje: 'El cuerpo de la petición excede el tamaño permitido', detalles: [] };
  }
  if (err?.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { estado: 413, codigo: 'ARCHIVO_MUY_GRANDE', mensaje: 'El archivo excede el máximo de 2 MB', detalles: [] }
      : { estado: 400, codigo: 'VALIDACION', mensaje: 'Carga de archivo inválida', detalles: [{ campo: err.field ?? 'archivo', mensaje: err.message }] };
  }
  return { estado: 500, codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor', detalles: [] };
}

const noEncontrado = (req, res, next) =>
  next(new NoEncontradoError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));

const manejarErrores = (log = console) => (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const n = normalizarError(err);
  if (n.estado >= 500) log.error?.(err.stack || err);
  res.status(n.estado).json({
    error: { codigo: n.codigo, mensaje: n.mensaje, detalles: n.detalles,
      ruta: req.originalUrl, marcaTiempo: new Date().toISOString() },
  });
};

/** Convierte los errores de express-validator al formato uniforme. */
function validar(req, res, next) {
  const { validationResult } = require('express-validator');
  const r = validationResult(req);
  if (r.isEmpty()) return next();
  return next(new ValidacionError('Datos de entrada inválidos',
    r.array({ onlyFirstError: true }).map((e) => ({ campo: e.path, mensaje: e.msg }))));
}

module.exports = { asyncHandler, normalizarError, noEncontrado, manejarErrores, validar };
