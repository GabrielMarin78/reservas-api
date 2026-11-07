'use strict';

/** Error de aplicación con estado HTTP y código estable para el cliente. */
class AppError extends Error {
  constructor(estado, codigo, mensaje, detalles = []) {
    super(mensaje);
    this.name = this.constructor.name;
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}
class ValidacionError extends AppError {
  constructor(mensaje = 'Datos de entrada inválidos', detalles = []) {
    super(400, 'VALIDACION', mensaje, detalles);
  }
}
class NoEncontradoError extends AppError {
  constructor(mensaje = 'Recurso no encontrado', detalles = []) {
    super(404, 'NO_ENCONTRADO', mensaje, detalles);
  }
}
class ConflictoError extends AppError {
  constructor(mensaje = 'Conflicto con el estado actual del recurso', detalles = []) {
    super(409, 'CONFLICTO', mensaje, detalles);
  }
}
class TipoNoSoportadoError extends AppError {
  constructor(mensaje = 'Tipo de archivo no soportado', detalles = []) {
    super(415, 'TIPO_NO_SOPORTADO', mensaje, detalles);
  }
}
class ReglaNegocioError extends AppError {
  constructor(mensaje = 'La solicitud incumple una regla de negocio', detalles = []) {
    super(422, 'REGLA_NEGOCIO', mensaje, detalles);
  }
}

module.exports = {
  AppError, ValidacionError, NoEncontradoError,
  ConflictoError, TipoNoSoportadoError, ReglaNegocioError,
};
