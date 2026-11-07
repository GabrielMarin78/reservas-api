'use strict';
/** Casos de uso: orquestan dominio (puro) + repositorio, almacén y notificador (E/S). */
const {
  crearDatosReserva, reemplazarDatos, cancelarDatos, detectarTipoArchivo,
  sanitizarNombreArchivo, construirFiltroListado, normalizarPaginacion, aVista,
} = require('../domain/reserva');
const { NoEncontradoError, ConflictoError, TipoNoSoportadoError } = require('../errors');

function crearServicioReservas({ repo, notificador, almacen, reloj = () => new Date(), log = console }) {
  // Una falla al notificar nunca debe tumbar la operación ya confirmada.
  const notificar = (tipo, datos) => {
    try { notificador.publicar(tipo, datos); }
    catch (e) { log.error?.(`No se pudo notificar ${tipo}: ${e.message}`); }
  };
  const limpiarArchivo = async (nombre) => {
    try { await almacen.eliminar(nombre); }
    catch (e) { log.error?.(`No se pudo eliminar archivo: ${e.message}`); }
  };

  async function exigir(id) {
    const r = await repo.obtenerPorId(id);
    if (!r) throw new NoEncontradoError(`No existe la reserva ${id}`);
    return r;
  }

  async function exigirLibre(sala, bloques, excluirId) {
    const choques = await repo.buscarConflictos({ sala, bloques, excluirId });
    if (choques.length > 0) {
      throw new ConflictoError(
        'La sala ya está reservada en ese horario',
        choques.map((c) => ({ campo: 'inicio', mensaje: `Se solapa con la reserva ${c.id}` })),
      );
    }
  }

  /** Aplica cambios con control de versión; distingue 404 de 409. */
  async function aplicar(actual, cambios) {
    const nueva = await repo.actualizarSiVersion(actual.id, actual.version, cambios);
    if (nueva) return nueva;
    const vigente = await repo.obtenerPorId(actual.id);
    if (!vigente) throw new NoEncontradoError(`No existe la reserva ${actual.id}`);
    throw new ConflictoError('La reserva fue modificada por otra operación; vuelva a consultarla', [
      { campo: 'version', mensaje: `versión vigente: ${vigente.version}` },
    ]);
  }

  return {
    async crear(entrada) {
      const datos = crearDatosReserva(entrada, reloj());
      await exigirLibre(datos.sala, datos.bloques);
      const vista = aVista(await repo.crear(datos));
      notificar('reserva:creada', vista);
      return vista;
    },

    async listar(consulta) {
      const filtro = construirFiltroListado(consulta);
      const paginacion = normalizarPaginacion(consulta);
      const { items, total } = await repo.listar(filtro, paginacion);
      return {
        datos: items.map(aVista),
        meta: {
          pagina: paginacion.pagina, limite: paginacion.limite, total,
          totalPaginas: Math.max(1, Math.ceil(total / paginacion.limite)),
        },
      };
    },

    async obtener(id) {
      return aVista(await exigir(id));
    },

    async reemplazar(id, entrada, versionEsperada) {
      const actual = await exigir(id);
      if (actual.version !== versionEsperada) {
        throw new ConflictoError('La reserva fue modificada por otra operación; vuelva a consultarla', [
          { campo: 'version', mensaje: `versión vigente: ${actual.version}` },
        ]);
      }
      const cambios = reemplazarDatos(actual, entrada, reloj());
      await exigirLibre(cambios.sala, cambios.bloques, id);
      const vista = aVista(await aplicar(actual, cambios));
      notificar('reserva:actualizada', vista);
      return vista;
    },

    async cancelar(id) {
      const actual = await exigir(id);
      const vista = aVista(await aplicar(actual, cancelarDatos(actual, reloj())));
      notificar('reserva:cancelada', vista);
      return vista;
    },

    async eliminar(id) {
      const actual = await exigir(id);
      if (!(await repo.eliminar(id))) throw new NoEncontradoError(`No existe la reserva ${id}`);
      if (actual.adjunto) await limpiarArchivo(actual.adjunto.archivo);
      notificar('reserva:eliminada', { id, sala: actual.sala });
    },

    async adjuntar(id, archivo) {
      const actual = await exigir(id);
      if (actual.estado !== 'activa') throw new ConflictoError('No se puede adjuntar a una reserva cancelada');
      const tipo = detectarTipoArchivo(archivo.buffer);
      if (!tipo) throw new TipoNoSoportadoError('Solo se permiten archivos PDF, PNG o JPEG');
      const nombre = await almacen.guardar(archivo.buffer, tipo.ext);
      const adjunto = {
        nombreOriginal: sanitizarNombreArchivo(archivo.originalname),
        archivo: nombre, mime: tipo.mime, tamano: archivo.buffer.length,
      };
      let actualizada;
      try { actualizada = await aplicar(actual, { adjunto }); }
      catch (e) { await limpiarArchivo(nombre); throw e; }
      if (actual.adjunto) await limpiarArchivo(actual.adjunto.archivo);
      const vista = aVista(actualizada);
      notificar('reserva:adjunto', vista);
      return vista;
    },

    async obtenerAdjunto(id) {
      const r = await exigir(id);
      if (!r.adjunto) throw new NoEncontradoError('La reserva no tiene archivo adjunto');
      return { ruta: almacen.ruta(r.adjunto.archivo), nombre: r.adjunto.nombreOriginal, mime: r.adjunto.mime };
    },
  };
}

module.exports = { crearServicioReservas };
