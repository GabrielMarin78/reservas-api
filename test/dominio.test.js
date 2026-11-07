'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/domain/reserva');
const { ReglaNegocioError, ConflictoError } = require('../src/errors');
const { AHORA, en, entradaValida } = require('./helpers/fechas');

const rango = (e) => [new Date(e.inicio), new Date(e.fin)];
const camposDe = (fn) => { try { fn(); } catch (e) { return e.detalles.map((x) => x.campo); } return null; };

describe('dominio: bloques y reglas de rango', () => {
  it('calcula un bloque por cada 30 minutos', () => {
    const b = d.calcularBloques(new Date(en(2)), new Date(en(3.5)));
    assert.equal(b.length, 3);
    assert.deepEqual(b, [b[0], b[0] + 1, b[0] + 2]);
  });
  it('rechaza fin <= inicio', () => {
    assert.deepEqual(camposDe(() => d.validarRango(new Date(en(4)), new Date(en(2)), AHORA)), ['fin']);
  });
  it('rechaza horas no alineadas a 30 min', () => {
    const ini = new Date(AHORA.getTime() + 2 * 3600e3 + 10 * 60e3);
    assert.ok(camposDe(() => d.validarRango(ini, new Date(en(4)), AHORA)).includes('inicio'));
  });
  it('rechaza duraciones mayores a 4 horas', () => {
    assert.ok(camposDe(() => d.validarRango(new Date(en(1)), new Date(en(6)), AHORA)).includes('fin'));
  });
  it('rechaza inicio en el pasado salvo que se desactive la regla', () => {
    const [i, f] = [new Date(en(-3)), new Date(en(-1))];
    assert.throws(() => d.validarRango(i, f, AHORA), ReglaNegocioError);
    assert.doesNotThrow(() => d.validarRango(i, f, AHORA, { exigirFuturo: false }));
  });
});

describe('dominio: transformaciones puras', () => {
  it('crearDatosReserva normaliza y no muta la entrada', () => {
    const entrada = Object.freeze(entradaValida({ sala: ' lab-101 ', motivo: '  Clase   de  redes ' }));
    const datos = d.crearDatosReserva(entrada, AHORA);
    assert.equal(datos.sala, 'LAB-101');
    assert.equal(datos.motivo, 'Clase de redes');
    assert.equal(datos.estado, 'activa');
    assert.equal(datos.bloques.length, 4);
    assert.ok(Object.isFrozen(datos));
  });
  it('reemplazarDatos devuelve cambios sin mutar la reserva actual', () => {
    const [inicio, fin] = rango(entradaValida());
    const actual = Object.freeze({ id: 'a', estado: 'activa', inicio, fin });
    const cambios = d.reemplazarDatos(actual, entradaValida({ motivo: 'Otro motivo' }), AHORA);
    assert.equal(cambios.motivo, 'Otro motivo');
    assert.equal(actual.motivo, undefined);
  });
  it('reemplazarDatos no permite editar canceladas', () => {
    const [inicio, fin] = rango(entradaValida());
    assert.throws(() => d.reemplazarDatos({ estado: 'cancelada', inicio, fin }, entradaValida(), AHORA), ConflictoError);
  });
  it('cancelarDatos libera bloques; falla si ya está cancelada o finalizó', () => {
    const [inicio, fin] = rango(entradaValida());
    assert.deepEqual(d.cancelarDatos({ estado: 'activa', inicio, fin }, AHORA), { estado: 'cancelada', bloques: [] });
    assert.throws(() => d.cancelarDatos({ estado: 'cancelada', inicio, fin }, AHORA), ConflictoError);
    assert.throws(() => d.cancelarDatos({ estado: 'activa', inicio, fin }, new Date(en(10))), ReglaNegocioError);
  });
});

describe('dominio: archivos y presentación', () => {
  it('detecta tipo por contenido, no por extensión', () => {
    assert.equal(d.detectarTipoArchivo(Buffer.from('%PDF-1.7 ...')).mime, 'application/pdf');
    assert.equal(d.detectarTipoArchivo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ext, '.png');
    assert.equal(d.detectarTipoArchivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).ext, '.jpg');
    assert.equal(d.detectarTipoArchivo(Buffer.from('<script>alert(1)</script>')), null);
    assert.equal(d.detectarTipoArchivo('no es buffer'), null);
  });
  it('sanitiza nombres de archivo', () => {
    assert.equal(d.sanitizarNombreArchivo('../../etc/passwd'), '.._.._etc_passwd');
    assert.equal(d.sanitizarNombreArchivo('a\u0000b.pdf'), 'ab.pdf');
    assert.equal(d.sanitizarNombreArchivo(''), 'adjunto');
    assert.equal(d.sanitizarNombreArchivo('x'.repeat(300)).length, 100);
  });
  it('el filtro ignora valores que no son texto (defensa ante inyección)', () => {
    assert.deepEqual(d.construirFiltroListado({ sala: { $ne: '' }, estado: ['activa'] }), {});
    assert.deepEqual(d.construirFiltroListado({ sala: 'lab-1', estado: 'activa' }), { sala: 'LAB-1', estado: 'activa' });
  });
  it('normaliza paginación con topes', () => {
    assert.deepEqual(d.normalizarPaginacion({}), { pagina: 1, limite: 20 });
    assert.deepEqual(d.normalizarPaginacion({ pagina: 3, limite: 999 }), { pagina: 3, limite: 100 });
  });
  it('aVista oculta datos internos y serializa fechas', () => {
    const [inicio, fin] = rango(entradaValida());
    const v = d.aVista({ id: 'x', sala: 'A', solicitante: 's', motivo: 'm', inicio, fin, estado: 'activa',
      version: 1, bloques: [1], creadoEn: AHORA, actualizadoEn: AHORA,
      adjunto: { nombreOriginal: 'o.pdf', archivo: 'secreto.pdf', mime: 'application/pdf', tamano: 5 } });
    assert.equal(v.inicio, en(2));
    assert.equal('bloques' in v, false);
    assert.equal('archivo' in v.adjunto, false);
    assert.equal(v.adjunto.url, '/api/v1/reservas/x/adjunto');
  });
});
