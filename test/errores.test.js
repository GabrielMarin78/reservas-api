'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarError } = require('../src/middlewares/error');
const { ConflictoError } = require('../src/errors');

describe('formato uniforme de errores', () => {
  it('respeta estado y código de AppError', () => {
    const n = normalizarError(new ConflictoError('choque', [{ campo: 'x', mensaje: 'y' }]));
    assert.deepEqual(n, { estado: 409, codigo: 'CONFLICTO', mensaje: 'choque', detalles: [{ campo: 'x', mensaje: 'y' }] });
  });
  it('traduce errores de body-parser y multer', () => {
    assert.equal(normalizarError({ type: 'entity.parse.failed' }).codigo, 'JSON_INVALIDO');
    assert.equal(normalizarError({ type: 'entity.too.large' }).estado, 413);
    assert.equal(normalizarError({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' }).codigo, 'ARCHIVO_MUY_GRANDE');
    assert.equal(normalizarError({ name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE', field: 'otro', message: 'm' }).estado, 400);
  });
  it('oculta los errores inesperados como 500 genérico', () => {
    const n = normalizarError(new Error('contraseña de la BD: 1234'));
    assert.equal(n.estado, 500);
    assert.ok(!n.mensaje.includes('1234'));
  });
});
