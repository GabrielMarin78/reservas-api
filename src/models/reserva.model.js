'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const adjuntoSchema = new Schema(
  { nombreOriginal: String, archivo: String, mime: String, tamano: Number },
  { _id: false },
);

const reservaSchema = new Schema(
  {
    sala: { type: String, required: true, trim: true, uppercase: true },
    solicitante: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    motivo: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    inicio: { type: Date, required: true },
    fin: { type: Date, required: true },
    estado: { type: String, enum: ['activa', 'cancelada'], default: 'activa' },
    bloques: { type: [Number], default: [] },
    adjunto: { type: adjuntoSchema, default: null },
    version: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' }, versionKey: false },
);

// Garantía atómica anti doble-reserva: un bloque de una sala solo puede estar
// en UNA reserva activa. El índice es multikey sobre `bloques` y parcial para
// que las canceladas liberen el horario.
reservaSchema.index(
  { sala: 1, bloques: 1 },
  { unique: true, partialFilterExpression: { estado: 'activa' }, name: 'sala_bloque_unico_activa' },
);
reservaSchema.index({ sala: 1, inicio: 1 });

module.exports = mongoose.models.Reserva || mongoose.model('Reserva', reservaSchema);
