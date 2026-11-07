'use strict';
const { matchedData } = require('express-validator');
const { ValidacionError } = require('../errors');

function crearControlador(servicio) {
  return {
    async crear(req, res) {
      const reserva = await servicio.crear(matchedData(req, { locations: ['body'] }));
      res.status(201).location(`/api/v1/reservas/${reserva.id}`).json({ datos: reserva });
    },
    async listar(req, res) {
      res.json(await servicio.listar(matchedData(req, { locations: ['query'] })));
    },
    async obtener(req, res) {
      res.json({ datos: await servicio.obtener(req.params.id) });
    },
    async reemplazar(req, res) {
      const { version, ...entrada } = matchedData(req, { locations: ['body'] });
      res.json({ datos: await servicio.reemplazar(req.params.id, entrada, version) });
    },
    async cancelar(req, res) {
      res.json({ datos: await servicio.cancelar(req.params.id) });
    },
    async eliminar(req, res) {
      await servicio.eliminar(req.params.id);
      res.status(204).end();
    },
    async adjuntar(req, res) {
      if (!req.file) {
        throw new ValidacionError('Datos de entrada inválidos', [
          { campo: 'archivo', mensaje: 'Envíe el archivo como multipart/form-data en el campo "archivo"' },
        ]);
      }
      res.json({ datos: await servicio.adjuntar(req.params.id, req.file) });
    },
    async descargarAdjunto(req, res, next) {
      const { ruta, nombre, mime } = await servicio.obtenerAdjunto(req.params.id);
      res.type(mime).set('X-Content-Type-Options', 'nosniff');
      res.download(ruta, nombre, (err) => { if (err && !res.headersSent) next(err); });
    },
  };
}

module.exports = { crearControlador };
