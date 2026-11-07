'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { crearAlmacenArchivos } = require('../src/storage/archivos');

describe('almacén de archivos en disco', () => {
  let dir; let almacen;
  before(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reservas-')); almacen = crearAlmacenArchivos(dir); });
  after(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('guarda con nombre aleatorio y lo recupera', async () => {
    const a = await almacen.guardar(Buffer.from('%PDF-1.4'), '.pdf');
    const b = await almacen.guardar(Buffer.from('%PDF-1.4'), '.pdf');
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f-]{36}\.pdf$/);
    assert.equal((await fs.readFile(almacen.ruta(a))).toString(), '%PDF-1.4');
  });
  it('elimina y tolera archivos inexistentes', async () => {
    const n = await almacen.guardar(Buffer.from('x'), '.png');
    await almacen.eliminar(n);
    await almacen.eliminar(n);
    await assert.rejects(fs.access(almacen.ruta(n)));
  });
  it('neutraliza intentos de path traversal', () => {
    assert.equal(path.dirname(almacen.ruta('../../etc/passwd')), dir);
  });
});
