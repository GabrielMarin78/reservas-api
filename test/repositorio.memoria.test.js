'use strict';
const { crearRepositorioMemoria } = require('../src/repositories/reserva.memory');
const { definirContratoRepositorio } = require('./helpers/contrato-repositorio');

definirContratoRepositorio('memoria', async () => ({ repo: crearRepositorioMemoria() }));
