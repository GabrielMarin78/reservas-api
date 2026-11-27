'use strict';
const path = require('node:path');

const entorno = process.env.NODE_ENV || 'development';
const esProduccion = entorno === 'production';

// En producción no se admite una base de datos "por defecto": se exige la variable.
if (esProduccion && !process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI es obligatoria cuando NODE_ENV=production');
}

/** "https://a.app, https://b.app/" -> ['https://a.app', 'https://b.app'] */
const lista = (valor) =>
  (valor || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

module.exports = Object.freeze({
  entorno,
  esProduccion,
  puerto: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reservas',
  directorioArchivos: path.resolve(process.env.UPLOADS_DIR || './uploads'),
  origenesPermitidos: lista(process.env.CORS_ORIGINS),
});
