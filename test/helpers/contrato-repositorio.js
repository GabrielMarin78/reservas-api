'use strict';
/** Contrato que TODO repositorio debe cumplir (memoria y Mongo comparten estas pruebas). */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { crearDatosReserva } = require('../../src/domain/reserva');
const { ConflictoError } = require('../../src/errors');
const { AHORA, en, entradaValida } = require('./fechas');

const datos = (extra) => crearDatosReserva(entradaValida(extra), AHORA);

function definirContratoRepositorio(nombre, fabrica) {
  describe(`Contrato de repositorio: ${nombre}`, () => {
    let repo; let cerrar;
    beforeEach(async () => { ({ repo, cerrar } = await fabrica()); });
    afterEach(async () => { await cerrar?.(); });

    it('crea y recupera una reserva sin exponer los bloques internos', async () => {
      const creada = await repo.crear(datos());
      assert.equal(creada.version, 1);
      assert.equal(creada.estado, 'activa');
      assert.ok(creada.id);
      assert.equal('bloques' in creada, false);
      assert.deepEqual(await repo.obtenerPorId(creada.id), creada);
    });

    it('devuelve null si el id no existe', async () => {
      assert.equal(await repo.obtenerPorId('0'.repeat(24)), null);
    });

    it('rechaza solapamientos en la misma sala', async () => {
      await repo.crear(datos());
      await assert.rejects(repo.crear(datos({ inicio: en(3), fin: en(5) })), ConflictoError);
    });

    it('permite la misma franja en otra sala y franjas contiguas', async () => {
      await repo.crear(datos());
      await repo.crear(datos({ sala: 'LAB-202' }));
      await repo.crear(datos({ inicio: en(4), fin: en(5) }));
    });

    it('garantiza que dos creaciones simultáneas no dupliquen el horario', async () => {
      const r = await Promise.allSettled([repo.crear(datos()), repo.crear(datos())]);
      assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
      const rechazada = r.find((x) => x.status === 'rejected');
      assert.ok(rechazada.reason instanceof ConflictoError);
    });

    it('una reserva cancelada libera el horario', async () => {
      const a = await repo.crear(datos());
      await repo.actualizarSiVersion(a.id, 1, { estado: 'cancelada', bloques: [] });
      await repo.crear(datos());
    });

    it('actualiza solo si la versión coincide', async () => {
      const a = await repo.crear(datos());
      assert.equal(await repo.actualizarSiVersion(a.id, 99, { motivo: 'x' }), null);
      const b = await repo.actualizarSiVersion(a.id, 1, { motivo: 'Nuevo motivo' });
      assert.equal(b.version, 2);
      assert.equal(b.motivo, 'Nuevo motivo');
      assert.equal(await repo.actualizarSiVersion(a.id, 1, { motivo: 'y' }), null);
    });

    it('buscarConflictos puede excluir la propia reserva', async () => {
      const a = await repo.crear(datos());
      const q = { sala: a.sala, bloques: datos().bloques };
      assert.equal((await repo.buscarConflictos(q)).length, 1);
      assert.equal((await repo.buscarConflictos({ ...q, excluirId: a.id })).length, 0);
    });

    it('lista con filtros y paginación ordenada por inicio', async () => {
      await repo.crear(datos({ inicio: en(6), fin: en(7) }));
      await repo.crear(datos({ inicio: en(2), fin: en(3) }));
      await repo.crear(datos({ sala: 'LAB-202', inicio: en(2), fin: en(3) }));
      const todas = await repo.listar({}, { pagina: 1, limite: 10 });
      assert.equal(todas.total, 3);
      const sala = await repo.listar({ sala: 'LAB-101' }, { pagina: 1, limite: 1 });
      assert.equal(sala.total, 2);
      assert.equal(sala.items.length, 1);
      assert.equal(sala.items[0].inicio.toISOString(), en(2));
      const rango = await repo.listar({ desde: new Date(en(5)) }, { pagina: 1, limite: 10 });
      assert.equal(rango.total, 1);
    });

    it('elimina y reporta si existía', async () => {
      const a = await repo.crear(datos());
      assert.equal(await repo.eliminar(a.id), true);
      assert.equal(await repo.eliminar(a.id), false);
    });
  });
}

module.exports = { definirContratoRepositorio };
