'use strict';
/** Repositorio en memoria: mismo contrato que el de Mongo; se usa en pruebas. */
const { randomBytes } = require('node:crypto');
const { ConflictoError } = require('../errors');

function crearRepositorioMemoria({ reloj = () => new Date() } = {}) {
  const registros = new Map();

  const publico = ({ bloques, ...resto }) => structuredClone(resto);
  const choca = (r, sala, bloques, excluirId) =>
    r.estado === 'activa' && r.sala === sala && r.id !== excluirId &&
    r.bloques.some((b) => bloques.includes(b));
  const buscar = (sala, bloques, excluirId) =>
    [...registros.values()].filter((r) => choca(r, sala, bloques, excluirId));
  const exigirLibre = (r) => {
    if (r.estado === 'activa' && buscar(r.sala, r.bloques, r.id).length > 0) {
      throw new ConflictoError('La sala ya está reservada en ese horario');
    }
  };

  return {
    async crear(datos) {
      const ahora = reloj();
      const registro = structuredClone({
        ...datos, id: randomBytes(12).toString('hex'),
        version: 1, creadoEn: ahora, actualizadoEn: ahora,
      });
      exigirLibre(registro); // equivale al índice único parcial de Mongo
      registros.set(registro.id, registro);
      return publico(registro);
    },
    async obtenerPorId(id) {
      const r = registros.get(id);
      return r ? publico(r) : null;
    },
    async buscarConflictos({ sala, bloques, excluirId }) {
      return buscar(sala, bloques, excluirId).map(publico);
    },
    async listar(filtro, { pagina, limite }) {
      const { sala, estado, desde, hasta } = filtro;
      const todos = [...registros.values()]
        .filter((r) => (!sala || r.sala === sala) && (!estado || r.estado === estado) &&
          (!hasta || r.inicio < hasta) && (!desde || r.fin > desde))
        .sort((a, b) => a.inicio - b.inicio || a.id.localeCompare(b.id));
      const items = todos.slice((pagina - 1) * limite, pagina * limite).map(publico);
      return { items, total: todos.length };
    },
    /** Actualiza solo si la versión coincide (concurrencia optimista). null si no. */
    async actualizarSiVersion(id, version, cambios) {
      const actual = registros.get(id);
      if (!actual || actual.version !== version) return null;
      const siguiente = structuredClone({
        ...actual, ...cambios, version: version + 1, actualizadoEn: reloj(),
      });
      exigirLibre(siguiente);
      registros.set(id, siguiente);
      return publico(siguiente);
    },
    async eliminar(id) {
      return registros.delete(id);
    },
  };
}

module.exports = { crearRepositorioMemoria };
