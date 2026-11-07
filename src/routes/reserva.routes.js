'use strict';
const express = require('express');
const { body, param, query } = require('express-validator');
const { asyncHandler, validar } = require('../middlewares/error');
const { subirArchivo } = require('../middlewares/subida');

const esTexto = (v) => typeof v === 'string'; // rechaza objetos/arreglos (NoSQL injection)
const ISO_CON_ZONA = /(Z|[+-]\d{2}:\d{2})$/;

const reglaId = param('id').isMongoId().withMessage('El id no es válido');

const fechaIso = (campo, ubicacion) =>
  ubicacion(campo)
    .custom(esTexto).withMessage(`${campo} es obligatorio y debe ser texto ISO 8601`).bail()
    .isISO8601({ strict: true, strictSeparator: true }).withMessage(`${campo} debe ser una fecha ISO 8601`).bail()
    .matches(ISO_CON_ZONA).withMessage(`${campo} debe incluir zona horaria (Z o ±hh:mm)`);

const reglasReserva = [
  body('sala').custom(esTexto).withMessage('sala es obligatoria y debe ser texto').bail()
    .trim().matches(/^[A-Za-z0-9-]{2,20}$/).withMessage('sala debe tener 2-20 caracteres alfanuméricos o guion'),
  body('solicitante').custom(esTexto).withMessage('solicitante es obligatorio y debe ser texto').bail()
    .trim().isLength({ min: 3, max: 80 }).withMessage('solicitante debe tener entre 3 y 80 caracteres'),
  body('motivo').custom(esTexto).withMessage('motivo es obligatorio y debe ser texto').bail()
    .trim().isLength({ min: 3, max: 200 }).withMessage('motivo debe tener entre 3 y 200 caracteres'),
  fechaIso('inicio', body),
  fechaIso('fin', body),
];

const reglaVersion = body('version').isInt({ min: 1 }).withMessage('version es obligatoria (entero >= 1)').toInt();

const reglasListado = [
  query('sala').optional().custom(esTexto).withMessage('sala debe ser texto').bail()
    .matches(/^[A-Za-z0-9-]{1,20}$/).withMessage('sala inválida'),
  query('estado').optional().isIn(['activa', 'cancelada']).withMessage('estado debe ser activa o cancelada'),
  query('desde').optional().isISO8601().withMessage('desde debe ser ISO 8601').toDate(),
  query('hasta').optional().isISO8601().withMessage('hasta debe ser ISO 8601').toDate(),
  query('pagina').optional().isInt({ min: 1 }).withMessage('pagina debe ser entero >= 1').toInt(),
  query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('limite debe estar entre 1 y 100').toInt(),
];

function crearRutasReservas(c) {
  const r = express.Router();
  r.post('/', reglasReserva, validar, asyncHandler(c.crear));
  r.get('/', reglasListado, validar, asyncHandler(c.listar));
  r.get('/:id', reglaId, validar, asyncHandler(c.obtener));
  r.put('/:id', reglaId, reglasReserva, reglaVersion, validar, asyncHandler(c.reemplazar));
  r.patch('/:id/cancelar', reglaId, validar, asyncHandler(c.cancelar));
  r.delete('/:id', reglaId, validar, asyncHandler(c.eliminar));
  r.post('/:id/adjunto', reglaId, validar, subirArchivo, asyncHandler(c.adjuntar));
  r.get('/:id/adjunto', reglaId, validar, asyncHandler(c.descargarAdjunto));
  return r;
}

module.exports = { crearRutasReservas };
