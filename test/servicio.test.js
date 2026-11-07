'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { crearServicioReservas } = require('../src/services/reserva.service');
const { crearRepositorioMemoria } = require('../src/repositories/reserva.memory');
const { ConflictoError, NoEncontradoError, ReglaNegocioError, TipoNoSoportadoError } = require('../src/errors');
const { AHORA, en, entradaValida } = require('./helpers/fechas');

const silencio = { error() {}, info() {} };
const PDF = Buffer.from('%PDF-1.4 contenido');

function armar({ notificadorFalla = false } = {}) {
  const eventos = []; const archivos = new Map();
  const notificador = { publicar(tipo, datos) { if (notificadorFalla) throw new Error('socket caído'); eventos.push({ tipo, datos }); } };
  const almacen = {
    async guardar(buf, ext) { const n = `f${archivos.size + 1}${ext}`; archivos.set(n, buf); return n; },
    async eliminar(n) { archivos.delete(n); },
    ruta: (n) => `/tmp/${n}`,
  };
  const servicio = crearServicioReservas({ repo: crearRepositorioMemoria({ reloj: () => AHORA }), notificador, almacen, reloj: () => AHORA, log: silencio });
  return { servicio, eventos, archivos };
}

describe('servicio de reservas', () => {
  let ctx;
  beforeEach(() => { ctx = armar(); });

  it('crea, normaliza y notifica en tiempo real', async () => {
    const r = await ctx.servicio.crear(entradaValida());
    assert.equal(r.sala, 'LAB-101');
    assert.equal(r.version, 1);
    assert.deepEqual(ctx.eventos.map((e) => e.tipo), ['reserva:creada']);
    assert.equal(ctx.eventos[0].datos.id, r.id);
  });

  it('rechaza reglas de negocio (422) sin notificar', async () => {
    await assert.rejects(ctx.servicio.crear(entradaValida({ inicio: en(-5), fin: en(-3) })), ReglaNegocioError);
    assert.equal(ctx.eventos.length, 0);
  });

  it('detecta solapamiento con detalle de la reserva en conflicto', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    await assert.rejects(ctx.servicio.crear(entradaValida({ inicio: en(3), fin: en(5) })),
      (e) => e instanceof ConflictoError && e.detalles[0].mensaje.includes(a.id));
    assert.equal(ctx.eventos.length, 1);
  });

  it('dos solicitudes simultáneas por el mismo horario: solo una gana', async () => {
    const r = await Promise.allSettled([ctx.servicio.crear(entradaValida()), ctx.servicio.crear(entradaValida())]);
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
    assert.ok(r.find((x) => x.status === 'rejected').reason instanceof ConflictoError);
  });

  it('PUT exige la versión vigente (concurrencia optimista)', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    const b = await ctx.servicio.reemplazar(a.id, entradaValida({ motivo: 'Motivo nuevo' }), 1);
    assert.equal(b.version, 2);
    await assert.rejects(ctx.servicio.reemplazar(a.id, entradaValida({ motivo: 'Otro' }), 1), ConflictoError);
    assert.deepEqual(ctx.eventos.map((e) => e.tipo), ['reserva:creada', 'reserva:actualizada']);
  });

  it('PUT puede moverse sin chocar consigo misma, pero no sobre otra reserva', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    await ctx.servicio.crear(entradaValida({ inicio: en(6), fin: en(7) }));
    const movida = await ctx.servicio.reemplazar(a.id, entradaValida({ inicio: en(3), fin: en(5) }), 1);
    assert.equal(movida.inicio, en(3));
    await assert.rejects(ctx.servicio.reemplazar(a.id, entradaValida({ inicio: en(5), fin: en(7) }), 2), ConflictoError);
  });

  it('cancelar libera el horario y notifica', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    assert.equal((await ctx.servicio.cancelar(a.id)).estado, 'cancelada');
    await ctx.servicio.crear(entradaValida());
    await assert.rejects(ctx.servicio.cancelar(a.id), ConflictoError);
    assert.ok(ctx.eventos.some((e) => e.tipo === 'reserva:cancelada'));
  });

  it('eliminar quita el adjunto y notifica; luego 404', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    await ctx.servicio.adjuntar(a.id, { buffer: PDF, originalname: 'oficio.pdf' });
    assert.equal(ctx.archivos.size, 1);
    await ctx.servicio.eliminar(a.id);
    assert.equal(ctx.archivos.size, 0);
    assert.equal(ctx.eventos.at(-1).tipo, 'reserva:eliminada');
    await assert.rejects(ctx.servicio.obtener(a.id), NoEncontradoError);
    await assert.rejects(ctx.servicio.eliminar(a.id), NoEncontradoError);
  });

  it('adjunta PDF válido y reemplaza el anterior sin dejar huérfanos', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    const v1 = await ctx.servicio.adjuntar(a.id, { buffer: PDF, originalname: 'a.pdf' });
    assert.equal(v1.adjunto.mime, 'application/pdf');
    assert.equal(v1.version, 2);
    await ctx.servicio.adjuntar(a.id, { buffer: PDF, originalname: 'b.pdf' });
    assert.equal(ctx.archivos.size, 1);
    const { nombre } = await ctx.servicio.obtenerAdjunto(a.id);
    assert.equal(nombre, 'b.pdf');
  });

  it('rechaza contenido que no es PDF/PNG/JPEG aunque se llame .pdf', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    await assert.rejects(ctx.servicio.adjuntar(a.id, { buffer: Buffer.from('MZ ejecutable'), originalname: 'virus.pdf' }), TipoNoSoportadoError);
    assert.equal(ctx.archivos.size, 0);
  });

  it('descargar adjunto inexistente es 404', async () => {
    const a = await ctx.servicio.crear(entradaValida());
    await assert.rejects(ctx.servicio.obtenerAdjunto(a.id), NoEncontradoError);
  });

  it('lista con filtro, paginación y metadatos', async () => {
    await ctx.servicio.crear(entradaValida());
    await ctx.servicio.crear(entradaValida({ sala: 'LAB-202' }));
    const r = await ctx.servicio.listar({ sala: 'lab-101', limite: 10 });
    assert.equal(r.meta.total, 1);
    assert.deepEqual([r.meta.pagina, r.meta.limite, r.meta.totalPaginas], [1, 10, 1]);
    assert.equal(r.datos[0].sala, 'LAB-101');
  });

  it('una falla al notificar no revierte la operación', async () => {
    const { servicio } = armar({ notificadorFalla: true });
    const r = await servicio.crear(entradaValida());
    assert.equal((await servicio.obtener(r.id)).id, r.id);
  });
});
