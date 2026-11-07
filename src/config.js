'use strict';
const path = require('node:path');

module.exports = Object.freeze({
  puerto: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reservas',
  directorioArchivos: path.resolve(process.env.UPLOADS_DIR || './uploads'),
});
