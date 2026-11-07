'use strict';
/** Repositorio MongoDB (Mongoose). Recibe el modelo inyectado; no importa mongoose. */
const { ConflictoError } = require('../errors');

const aEntidad = (doc) => {
  if (!doc) return null;
  const { _id, bloques, __v, ...resto } = doc;
  return { id: String(_id), ...resto, adjunto: resto.adjunto ?? null };
};

function traducirError(e) {
  if (e && e.code === 11000) throw new ConflictoError('La sala ya está reservada en ese horario');
  throw e;
}

function crearRepositorioMongo(Reserva) {
  return {
    async crear(datos) {
      try {
        const doc = await Reserva.create({ ...datos });
        return aEntidad(doc.toObject());
      } catch (e) { return traducirError(e); }
    },
    async obtenerPorId(id) {
      return aEntidad(await Reserva.findById(id).lean());
    },
    async buscarConflictos({ sala, bloques, excluirId }) {
      const consulta = { sala, estado: 'activa', bloques: { $in: bloques } };
      if (excluirId) consulta._id = { $ne: excluirId };
      return (await Reserva.find(consulta).lean()).map(aEntidad);
    },
    async listar({ sala, estado, desde, hasta }, { pagina, limite }) {
      const consulta = {};
      if (sala) consulta.sala = String(sala);
      if (estado) consulta.estado = String(estado);
      if (hasta) consulta.inicio = { $lt: hasta };
      if (desde) consulta.fin = { $gt: desde };
      const [docs, total] = await Promise.all([
        Reserva.find(consulta).sort({ inicio: 1, _id: 1 })
          .skip((pagina - 1) * limite).limit(limite).lean(),
        Reserva.countDocuments(consulta),
      ]);
      return { items: docs.map(aEntidad), total };
    },
    async actualizarSiVersion(id, version, cambios) {
      try {
        const doc = await Reserva.findOneAndUpdate(
          { _id: id, version },
          { $set: cambios, $inc: { version: 1 } },
          { returnDocument: 'after', runValidators: true, lean: true },
        );
        return aEntidad(doc);
      } catch (e) { return traducirError(e); }
    },
    async eliminar(id) {
      const r = await Reserva.deleteOne({ _id: id });
      return r.deletedCount > 0;
    },
  };
}

module.exports = { crearRepositorioMongo };
