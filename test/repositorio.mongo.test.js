'use strict';
/** Se ejecuta solo si hay una BD de pruebas: MONGODB_URI_TEST=mongodb://127.0.0.1:27017/reservas_test */
const { describe, it } = require('node:test');
const uri = process.env.MONGODB_URI_TEST;

if (!uri) {
  describe('Contrato de repositorio: mongo', () => {
    it('omitido: defina MONGODB_URI_TEST para ejecutarlo', { skip: true }, () => {});
  });
} else {
  const mongoose = require('mongoose');
  const Reserva = require('../src/models/reserva.model');
  const { crearRepositorioMongo } = require('../src/repositories/reserva.mongo');
  const { definirContratoRepositorio } = require('./helpers/contrato-repositorio');
  const { after } = require('node:test');

  let conectado;
  definirContratoRepositorio('mongo', async () => {
    conectado ??= mongoose.connect(uri);
    await conectado;
    await Reserva.init();
    await Reserva.deleteMany({});
    return { repo: crearRepositorioMongo(Reserva) };
  });
  after(async () => { await mongoose.disconnect(); });
}
