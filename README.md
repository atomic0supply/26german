# LeakOps CRM MVP

Piloto interno para una empresa de inspeccion de fugas de agua. La app cubre el flujo minimo de `tecnicos + oficina` con Firebase Auth, Firestore, Storage y Cloud Functions.

## Alcance del MVP

- CRM ligero de clientes con los campos:
  - `name`
  - `surname`
  - `principalContact`
  - `email`
  - `phone`
  - `location`
- Una sola plantilla PDF oficial AcroForm.
- Flujo guiado de informe:
  - empresa destinataria
  - cliente y ubicacion
  - datos tecnicos
  - fotos y anotaciones simples
  - firma
  - preview PDF
  - finalizacion
  - envio por correo SMTP
- Agenda basica derivada de reportes existentes con `appointmentDate`.
- UI renovada `mobile-first` para tecnicos, con vista operativa tambien para oficina.

## Roles del MVP

- `technician`
  - crea clientes e informes propios
  - edita y elimina solo sus borradores
  - finaliza sus informes
  - envia el PDF final
- `office`
  - puede iniciar sesion y revisar clientes/reportes del piloto
  - ve agenda y seguimiento sin errores de permisos
  - no edita borradores ajenos
  - puede abrir y enviar PDFs finales para seguimiento operativo
- `admin`
  - acceso operativo completo
  - gestion de usuarios y configuracion SMTP

## Lo que no entra en esta entrega

- Sin sincronizacion con IONOS.
- Sin calendario externo.
- Sin motor avanzado de visitas separado.
- Sin gestion avanzada de multiples plantillas PDF.
- Sin IA para extraccion o sugerencia de campos.

## Estructura del proyecto

- `app/`: frontend React + Vite
- `functions/`: Cloud Functions, render PDF y tests
- `companies/`: logos por empresa destinataria
- `doc/template.pdf`: PDF base AcroForm oficial
- `firestore.rules`, `storage.rules`, `firebase.json`
- `scripts/provision-user.mjs`: provisionado minimo de usuarios

## Assets requeridos

Antes de entregar el piloto, confirma que estos recursos son los definitivos:

- `doc/template.pdf`
- logos cargados en Storage segun los `companyId` definidos en la app
- bucket de Storage configurado para fotos, firmas y PDFs finales

## Configuracion

1. Instalar dependencias

```bash
npm install
```

2. Configurar Firebase

- Ajusta `.firebaserc` con la project ID correcta.
- Rellena `app/.env` con las variables `VITE_FIREBASE_*`.
- Comprueba que Firestore, Auth, Functions y Storage existen en el proyecto.

3. Provisionar usuarios del piloto

```bash
npm run provision:user -- --email tech@example.com --password 'SECRET' --displayName 'Tecnico Uno'
```

Despues, verifica en `users/{uid}`:

- `role`: `technician`, `office` o `admin`
- `active: true`

4. Configurar SMTP

Opciones soportadas:

- Variables de entorno para Functions:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
- O documento `config/smtp` en Firestore, que tiene prioridad sobre el entorno

5. Configurar Storage

- Define el bucket correcto en Firebase.
- Si hace falta, exporta `FIREBASE_STORAGE_BUCKET` para Functions.

## Desarrollo local

- Frontend:

```bash
npm run dev
```

- Frontend + emuladores:

```bash
npm run dev:local
```

Nota: los emuladores de Firebase requieren Java 11+.

## Comandos de validacion

- Tests unitarios y backend:

```bash
npm test
```

- Build completa:

```bash
npm run build
```

- Lint:

```bash
npm run lint
```

- Reglas con emulator:

```bash
npm run test:integration --workspace functions
```

## Pruebas E2E

La suite incluye:

- smoke publico del login
- smoke autenticado del MVP, activado solo si existen:
  - `E2E_EMAIL`
  - `E2E_PASSWORD`

Ese smoke recorre:

- login
- alta de cliente
- creacion de informe
- rellenado basico
- firma
- preview PDF

## Checklist de primer arranque

- `npm install` completado
- `.firebaserc` apuntando al proyecto correcto
- `app/.env` configurado
- bucket de Storage disponible
- `doc/template.pdf` presente
- logos de empresas accesibles
- SMTP configurado
- al menos un usuario `technician`
- al menos un usuario `office` o `admin`
- documentos `users/{uid}` con `role` y `active` correctos

## Checklist de entrega del piloto

- login de tecnico correcto
- alta y edicion de cliente
- creacion de informe con empresa destinataria
- subida de foto y anotacion simple
- firma del tecnico
- preview PDF correcta
- finalizacion del PDF
- envio por correo
- usuario `office` puede leer clientes y reportes sin error de permisos
- agenda sin datos simulados

## Despliegue

```bash
npm run build
firebase deploy
```
