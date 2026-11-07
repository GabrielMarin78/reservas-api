# API de Reservas de Salas y Laboratorios

API REST con **Node.js + Express**, persistencia en **MongoDB (Mongoose)**, carga de archivos con **Multer** y notificaciones en tiempo real con **Socket.io**. Proyecto de la Unidad II – Programación del lado del servidor.

## Requisitos y puesta en marcha

- Node.js 20 o superior y MongoDB 6+ (local o `docker compose up -d`).

```bash
npm install
cp .env.example .env        # opcional: PORT, MONGODB_URI, UPLOADS_DIR
npm start                   # http://localhost:3000
```

Abra `http://localhost:3000` para ver el panel de eventos en vivo.

## Reglas del dominio

- Una reserva ocupa bloques de **30 min**: `inicio` y `fin` en hora en punto o y media, con zona horaria (`Z` o `-05:00`).
- Duración máxima: 4 horas. `inicio` debe ser futuro. `fin > inicio`.
- Dos reservas **activas** de la misma sala no pueden solaparse.
- Cancelar una reserva libera el horario. Una reserva cancelada no se puede editar.

## Endpoints (`/api/v1`)

| Método | Ruta | Descripción | Éxito | Errores |
|---|---|---|---|---|
| POST | `/reservas` | Crear | 201 + `Location` | 400, 409, 422 |
| GET | `/reservas` | Listar (filtros `sala`, `estado`, `desde`, `hasta`, `pagina`, `limite`) | 200 | 400 |
| GET | `/reservas/:id` | Consultar | 200 | 400, 404 |
| PUT | `/reservas/:id` | Reemplazar (exige `version`) | 200 | 400, 404, 409, 422 |
| PATCH | `/reservas/:id/cancelar` | Cancelar | 200 | 404, 409, 422 |
| DELETE | `/reservas/:id` | Eliminar | 204 | 404 |
| POST | `/reservas/:id/adjunto` | Subir PDF/PNG/JPEG ≤ 2 MB (campo `archivo`) | 200 | 400, 404, 409, 413, 415 |
| GET | `/reservas/:id/adjunto` | Descargar adjunto | 200 | 404 |
| GET | `/salud` | Estado del servicio | 200 | – |

Códigos: **400** validación de formato · **404** no existe · **409** conflicto (solapamiento o versión desactualizada) · **413** archivo grande · **415** tipo no soportado · **422** regla de negocio · **500** error interno.

### Formato de errores (uniforme)

```json
{
  "error": {
    "codigo": "CONFLICTO",
    "mensaje": "La sala ya está reservada en ese horario",
    "detalles": [{ "campo": "inicio", "mensaje": "Se solapa con la reserva 622aa413871535a3d215f2a6" }],
    "ruta": "/api/v1/reservas",
    "marcaTiempo": "2027-03-10T15:00:00.000Z"
  }
}
```

## Ejemplos de petición/respuesta

### Crear reserva

```bash
curl -i -X POST http://localhost:3000/api/v1/reservas \
  -H "Content-Type: application/json" \
  -d '{"sala":"lab-101","solicitante":"Ana Pérez","motivo":"Práctica de redes",
       "inicio":"2027-03-15T14:00:00-05:00","fin":"2027-03-15T16:00:00-05:00"}'
```
```http
HTTP/1.1 201 Created
Location: /api/v1/reservas/622aa413871535a3d215f2a6

{
  "datos": {
    "id": "622aa413871535a3d215f2a6",
    "sala": "LAB-101",
    "solicitante": "Ana Pérez",
    "motivo": "Práctica de redes",
    "inicio": "2027-03-15T19:00:00.000Z",
    "fin": "2027-03-15T21:00:00.000Z",
    "estado": "activa",
    "version": 1,
    "adjunto": null,
    "creadoEn": "2027-03-10T15:00:00.000Z",
    "actualizadoEn": "2027-03-10T15:00:00.000Z"
  }
}
```

### Conflicto por solapamiento (409)

Misma sala, de 15:00 a 17:00 (se cruza con la anterior):

```json
{ "error": { "codigo": "CONFLICTO", "mensaje": "La sala ya está reservada en ese horario",
  "detalles": [{ "campo": "inicio", "mensaje": "Se solapa con la reserva 622aa413871535a3d215f2a6" }],
  "ruta": "/api/v1/reservas", "marcaTiempo": "2027-03-10T15:01:00.000Z" } }
```

### Regla de negocio (422) y validación (400)

`inicio` a las 14:10 (no está en hora en punto ni y media):

```json
{ "error": { "codigo": "REGLA_NEGOCIO", "mensaje": "La reserva incumple las reglas de negocio",
  "detalles": [{ "campo": "inicio", "mensaje": "inicio debe estar en hora en punto o y media" }],
  "ruta": "/api/v1/reservas", "marcaTiempo": "2027-03-10T15:02:00.000Z" } }
```

Cuerpo `{"sala":"x","inicio":"ayer"}`:

```json
{ "error": { "codigo": "VALIDACION", "mensaje": "Datos de entrada inválidos",
  "detalles": [
    { "campo": "sala", "mensaje": "sala debe tener 2-20 caracteres alfanuméricos o guion" },
    { "campo": "solicitante", "mensaje": "solicitante es obligatorio y debe ser texto" },
    { "campo": "inicio", "mensaje": "inicio debe ser una fecha ISO 8601" } ],
  "ruta": "/api/v1/reservas", "marcaTiempo": "2027-03-10T15:03:00.000Z" } }
```

### Listar con filtros

```bash
curl "http://localhost:3000/api/v1/reservas?sala=lab-101&estado=activa&pagina=1&limite=10"
```
```json
{ "datos": [ { "id": "622aa413871535a3d215f2a6", "sala": "LAB-101", "estado": "activa", "version": 1, "…": "…" } ],
  "meta": { "pagina": 1, "limite": 10, "total": 1, "totalPaginas": 1 } }
```

### Modificar con control de concurrencia

El `PUT` debe incluir la `version` leída. Si otro cliente modificó la reserva, responde **409**:

```bash
curl -X PUT http://localhost:3000/api/v1/reservas/622aa413871535a3d215f2a6 \
  -H "Content-Type: application/json" \
  -d '{"sala":"lab-101","solicitante":"Ana Pérez","motivo":"Práctica de redes II",
       "inicio":"2027-03-15T14:00:00-05:00","fin":"2027-03-15T16:00:00-05:00","version":1}'
```
Respuesta 200: igual al recurso, con `"version": 2`. Repetir con `"version": 1` → 409 `"La reserva fue modificada por otra operación; vuelva a consultarla"`.

### Cancelar y eliminar

```bash
curl -X PATCH  http://localhost:3000/api/v1/reservas/<id>/cancelar   # 200, "estado": "cancelada"
curl -X DELETE http://localhost:3000/api/v1/reservas/<id>            # 204 sin cuerpo
```

### Adjuntar archivo (sesión de archivos)

```bash
curl -X POST http://localhost:3000/api/v1/reservas/<id>/adjunto -F "archivo=@oficio.pdf"
```
```json
{ "datos": { "id": "…", "version": 2,
  "adjunto": { "nombreOriginal": "oficio.pdf", "mime": "application/pdf", "tamano": 48213,
               "url": "/api/v1/reservas/622aa413871535a3d215f2a6/adjunto" } } }
```
Un archivo cuyo contenido no sea PDF/PNG/JPEG (aunque se llame `.pdf`) → **415**; mayor a 2 MB → **413**.

## Tiempo real (Socket.io)

El servidor emite a todos los clientes conectados:

| Evento | Cuándo | `datos` |
|---|---|---|
| `reserva:creada` | POST | reserva |
| `reserva:actualizada` | PUT | reserva |
| `reserva:cancelada` | PATCH cancelar | reserva |
| `reserva:eliminada` | DELETE | `{ id, sala }` |
| `reserva:adjunto` | POST adjunto | reserva |

Sobre: `{ "tipo": "reserva:creada", "ocurridoEn": "2027-03-10T15:00:00.000Z", "datos": { … } }`.

```js
const socket = io('http://localhost:3000');
socket.on('reserva:creada', (ev) => console.log('Nueva reserva en', ev.datos.sala));
```

## Arquitectura

```
src/
├── domain/reserva.js          Funciones PURAS: reglas, bloques, validación de rango, tipo de archivo, vistas
├── services/reserva.service.js  Casos de uso: orquestan dominio + E/S
├── repositories/              Contrato único: reserva.mongo.js (producción) y reserva.memory.js (pruebas)
├── models/reserva.model.js    Esquema Mongoose + índice único parcial multikey
├── controllers/ · routes/     HTTP: validación (express-validator) y respuestas
├── middlewares/               Errores uniformes, carga de archivos (Multer)
├── storage/archivos.js        E/S de disco aislada
├── realtime/notificador.js    Socket.io detrás de un puerto `publicar(tipo, datos)`
└── app.js · server.js         Composición (inyección de dependencias) y arranque
```

Decisiones clave:

- **Puro vs. E/S:** el dominio no importa `fs`, Mongo ni Express; devuelve objetos nuevos y no muta argumentos.
- **Conflictos de horario:** se verifica primero en servicio (mensaje claro con la reserva en conflicto) y, como garantía atómica ante concurrencia, un **índice único parcial multikey** `{sala, bloques}` solo para reservas activas. `E11000` se traduce a 409.
- **Conflictos de edición:** campo `version` y `findOneAndUpdate({_id, version})` (concurrencia optimista).
- **Consultas seguras:** validación de tipos (rechaza `?sala[$ne]=x`), filtros construidos con valores tipados, sin concatenar consultas.
- **Archivos:** memoria + límite 2 MB, tipo por *magic bytes*, nombre aleatorio en disco, nombre original sanitizado, `nosniff` en descarga.

## Pruebas

```bash
npm test                                   # dominio, servicio, repositorio en memoria, errores, archivos, API y tiempo real
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/reservas_test npm test   # añade el contrato contra MongoDB real
```

Las pruebas de repositorio comparten un **contrato**: se ejecuta igual contra memoria y contra MongoDB. `test/api.test.js` prueba cada endpoint y los eventos de Socket.io.

Prueba manual con Postman/curl: cree una reserva, repítala (409), use una hora como `14:10` (422), omita campos (400), consulte un id inexistente (404) y suba un `.txt` renombrado a `.pdf` (415).
