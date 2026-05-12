# Auditoría UI/UX — App de informes (26german)

**Fecha:** 2026-05-12 · **Alcance:** sólo frontend (`app/src/**`). Backend, esquema, Firebase y functions quedan fuera de scope por instrucción del usuario.

> Esta auditoría no aplica cambios. Es diagnóstico + plan priorizado.

---

## 0. Resumen ejecutivo

La app ya tiene buenos cimientos (tokens en `styles.css`, sistema de componentes en `ui/`, glassmorphism coherente azul/teal), pero **se siente cosida**: cada sección reescribió sus propios botones, listas, layouts y media queries. Eso rompe la sensación premium.

Los tres puntos que más restan calidad percibida hoy:

1. **Estilos en línea masivos** en pantallas administrativas (`AdminPanel.tsx` 69 ocurrencias, `CustomerWorkspace.tsx` 19, `PartnerManager.tsx` 15) — el sistema de tokens existe pero estas pantallas no lo usan.
2. **Listas tipo tabla sin variante móvil real** (`.report-row`, `.client-row`, `.partner-row`) — caben mal por debajo de 480 px y no colapsan a tarjeta.
3. **Botones inconsistentes**: `btn-primary`, `ghost`, `cal-detail__btn`, `smtp-button-primary`, `ann__tbtn`, `ghost icon-only` (sin CSS) — seis "botones primarios" distintos.

A continuación, problemas concretos por área con prioridad, archivos y plan. Al final, dos secciones: **Quick wins (≤1 día)** y **Cambios estructurales (≤1 semana)**.

---

## 1. Navegación / AppShell

### 1.1 Conmutación de vistas sin shell unificado · Prioridad **media**
- **Problema:** [App.tsx:189-227](app/src/App.tsx) hace un `if/else` entre `LeckortungPage`, `ReportEditor`, `ReportList`. No hay un AppShell con sidebar persistente; cada vista re-renderiza su propio header. El usuario pierde el contexto de navegación al entrar en el editor.
- **Impacto UX:** sensación de saltar entre "pantallas" desconectadas; no hay forma de volver al dashboard sin pasar por "Volver". Se pierde el estado de filtros del dashboard al editar.
- **Solución:** introducir un `AppShell` mínimo que envuelva `ReportList`/`ReportEditor` con la misma topbar + breadcrumbs (la `LeckortungPage` queda fuera porque es full-screen del cliente). No hace falta sidebar persistente; basta breadcrumb + acción "back to list" sticky.
- **Archivos:** [app/src/App.tsx](app/src/App.tsx), nuevo `app/src/components/AppShell.tsx`, [ReportEditor.tsx](app/src/components/ReportEditor.tsx) hero, [ReportList.tsx](app/src/components/ReportList.tsx) header.

### 1.2 Bottom-nav móvil presente pero sólo en algunas vistas · Prioridad **baja**
- **Problema:** `.app-bottom-nav` existe en `styles.css:3045-3080` pero su mounting es opaco; no se ve en `LeckortungPage` ni `ReportEditor` consistentemente.
- **Solución:** definir explícitamente qué vistas la muestran y aplicarlo. Móvil sin bottom-nav obliga a volver con back del navegador, lo cual confunde.

---

## 2. Formularios (Leckortung, Einsatzbericht, Clientes, Partners)

### 2.1 Duplicación visual Leckortung modal vs página · Prioridad **media**
- **Problema:** Ya resuelto a nivel de helpers (`lib/leckortung.ts`), pero **el chrome visual sigue dividido**: `.leckortung-*` (modal) y `.leck-page__*` (full-screen) son dos sistemas de clases distintos. La misma información se ve diferente según ruta.
- **Impacto UX:** el cliente que firma ve una pantalla; el técnico que revisa en el editor ve otra. Inconsistencia que rompe confianza.
- **Solución:** mover el modal a usar las clases `leck-page__*` también, o derivar ambos de un `LeckortungForm` interno con variantes de chrome (modal/page). Mantener un sólo grid de campos.
- **Archivos:** [LeckortungFormModal.tsx](app/src/components/LeckortungFormModal.tsx), [LeckortungPage.tsx](app/src/components/LeckortungPage.tsx), bloque `.leckortung-*` y `.leck-page__*` en [styles.css](app/src/styles.css).

### 2.2 Forms de Cliente/Partner duplican definiciones de campo · Prioridad **alta**
- **Problema:** [ClientManager.tsx:290-370 vs 380-451](app/src/components/ClientManager.tsx): el formulario de creación y el de edición tienen 9 campos definidos dos veces. Cualquier cambio se duplica. Igual situación en [PartnerManager.tsx](app/src/components/PartnerManager.tsx).
- **Impacto UX:** drift entre crear y editar (placeholders, validaciones, orden de campos). Bugs latentes.
- **Solución:** extraer `ClientFormFields.tsx` y `PartnerFormFields.tsx` que reciban `value` + `onChange`. Modos crear/editar montan el mismo componente con `<Button>` distinto.
- **Cambios:** estructural pero acotado (~2 archivos por entidad). No toca backend.

### 2.3 `PartnerManager` con 15 `style={{...}}` inline · Prioridad **alta**
- **Problema:** [PartnerManager.tsx:140,147-149,165-191,202,217,224](app/src/components/PartnerManager.tsx) — flexbox, gaps, márgenes, colores muted, fondo highlight de fila seleccionada — todo en línea. Salta del sistema de tokens.
- **Impacto UX:** padding visualmente distinto al resto, "huele" a app diferente.
- **Solución:** crear `.partner-manager__*` BEM en `styles.css`, usar `--space-*` tokens. Reemplazar `rgba(19,95,150,0.08)` por `rgba(var(--primary-rgb), 0.08)`.

### 2.4 Sin validación en línea · Prioridad **media**
- **Problema:** los forms (Leckortung, Cliente, Partner, Editor) sólo validan al pulsar enviar. Estamos en 2026; el técnico espera ver el error al salir del campo.
- **Impacto UX:** correcciones de último minuto en sitio del cliente, mala experiencia.
- **Solución:** validación por `onBlur` + estilos `--ring-danger` en el ring cuando un campo requerido queda vacío + mensaje inline `<small>` debajo. Nada de librerías nuevas (mantener vainilla por restricción de scope).

### 2.5 Editor de informe (5 pasos) sin indicador "X de Y rellenos" por paso · Prioridad **media**
- **Problema:** el `ProgressStepper` ya tiene estados done/active/blocked, pero dentro del paso no se ve cuántos campos requeridos faltan.
- **Solución:** añadir un mini-indicador en el header del paso ("3 de 5 campos requeridos"). Ya hay lógica `currentStepComplete(step)` en [ReportEditor.tsx:716](app/src/components/ReportEditor.tsx); extender a contar requeridos.

---

## 3. Calendario / Agenda

### 3.1 Skeleton mínimo (3 filas fijas) · Prioridad **baja**
- **Problema:** `VisitCalendar.tsx:180-184` muestra 3 filas dummy sin indicar volumen real esperado.
- **Solución:** ya tenemos `SkeletonBlock`; usar variantes que coincidan con el layout final (grid de 7 columnas en week, 4-6 filas en agenda).

### 3.2 Filtros se resetean al cambiar de vista · Prioridad **media**
- **Problema:** al alternar month/week/agenda, el filtro de partner/status puede perderse (no confirmé al 100% en código, marcar para verificar).
- **Solución:** subir el estado de filtros a un padre o persistir en URL hash.

### 3.3 Drag-to-reschedule sin affordance visual · Prioridad **media**
- **Problema:** `WeekGrid` permite mover/redimensionar visitas pero no hay `cursor: grab` ni hint en hover.
- **Solución:** añadir `cursor: grab` + un `<small>` "arrastra para mover" en el primer uso (persistir en localStorage).

### 3.4 `EventDetailModal` usa `.cal-detail__btn` propios · Prioridad **alta**
- **Problema:** [EventDetailModal.tsx:94,107,120](app/src/components/calendar/EventDetailModal.tsx) — botones con clase propia distinta al sistema. `cal-detail__btn--primary` usa `#0c456d` hover (color fijo, no token).
- **Solución:** sustituir por `.btn-primary` / `.ghost` estándar. Si se necesita altura compacta para el modal, añadir `.btn--sm` global, no clase por feature.

---

## 4. Clientes / MessortObjekt

### 4.1 Layout dos columnas sin colapso móvil · Prioridad **alta**
- **Problema:** [ClientManager.tsx:155](app/src/components/ClientManager.tsx) usa `.grid.three` para 9 campos del formulario. En móvil sigue siendo 3 columnas → campos ilegibles a 380 px.
- **Solución:** media query a 600 px → `grid-template-columns: 1fr`. Probablemente ya falta una regla en `styles.css` para `.grid.three`.

### 4.2 Edit-in-place sin "discard changes" warning · Prioridad **media**
- **Problema:** si el técnico edita un cliente y navega fuera, los cambios se pierden sin aviso.
- **Solución:** `useEffect` que detecte `beforeunload` + cambios pendientes en local state. Para navegación interna, ya tenemos `useReportDraftBackup`; aplicar el mismo patrón a clientes.

### 4.3 Ícono de mapa en SVG inline · Prioridad **baja**
- **Problema:** [ClientManager.tsx:18-23](app/src/components/ClientManager.tsx) define un SVG de mapa a mano; el resto de la app ya usa `lucide-react`.
- **Solución:** sustituir por `<MapPin size={14} />` de lucide.

---

## 5. Partners / Firmen

### 5.1 Mismo problema que clientes pero peor (mayor uso inline) · Prioridad **alta**
- Ver sección 2.3. Es la sección con peor ratio "ad-hoc styles / tokens".

### 5.2 Botón "Initiale Partner laden" (seed) sin feedback · Prioridad **baja**
- **Problema:** [PartnerManager.tsx:115-134](app/src/components/PartnerManager.tsx) inserta varios docs en Firestore en bulk pero no muestra progreso ni resultado.
- **Solución:** disparar toast `info` "Importando…" → `success` "12 partners cargados" al terminar. No requiere backend (sólo UI sobre la callable existente).

---

## 6. Lista de informes / Jobs

### 6.1 `.report-row` no colapsa a tarjeta en móvil · Prioridad **alta**
- **Problema:** [ReportList.tsx](app/src/components/ReportList.tsx) usa filas tipo tabla (`.report-row` flex con copy + actions). En <480 px las acciones (Open/Delete) quedan amontonadas o desbordan.
- **Solución:** en `@media (max-width: 600px)`, cambiar `.report-row` a `flex-direction: column`, mover acciones a una fila inferior con tamaño completo. Esto es 1 bloque CSS.

### 6.2 Sin skeleton para la lista, sólo texto "Cargando" · Prioridad **media**
- **Problema:** [ReportList.tsx:831-839](app/src/components/ReportList.tsx) muestra SectionCard con string. Premium = skeleton.
- **Solución:** renderizar 4-5 `SkeletonBlock` con la forma de `.report-row`.

### 6.3 Filtros como tabs con counters · Prioridad **baja** (positivo)
- Buena UX. Mantener. Sólo asegurar que en móvil hagan scroll horizontal cuando los counters superan el ancho.

### 6.4 Modal de "crear visita" con `style={{ gridColumn: "1 / -1" }}` inline · Prioridad **media**
- **Problema:** [ReportList.tsx:901-902](app/src/components/ReportList.tsx) — clave de layout fuera del sistema.
- **Solución:** añadir clase utilitaria `.grid-span-full` en `styles.css`.

---

## 7. Modales

### 7.1 Inventario · Prioridad **baja** (positivo)
- 100% de los modales usan `ui/Dialog`. No hay modales custom rotos. Esto es bueno.
- El motion ya está aplicado (cambio reciente).

### 7.2 Footer de modal sin patrón unificado · Prioridad **media**
- **Problema:** unos modales hacen `<div className="row">`, otros `<div className="finalize-actions">`, otros `<>...</>`. Padding y gap difieren.
- **Solución:** crear `.dialog-footer-actions` o un componente `<DialogFooter>` que ya envuelve botones con gap y orden (primario a la derecha).

### 7.3 Tamaños sólo `default`/`narrow`/`wide` · Prioridad **baja**
- Bien tipado pero `size="default"` se usa para cosas con poco contenido; debería existir `size="sm"` (~440px).

---

## 8. Botones (transversal)

### 8.1 Seis "primarios" diferentes · Prioridad **alta**
- `btn-primary`, `cal-detail__btn--primary`, `smtp-button-primary` (con `#0f172a` hardcoded), `ann__tbtn` (toolbar 34px), `leck-page__submit`, `leck-page__back`.
- **Solución:** definir variantes en CSS: `.btn` + modificadores `.btn--primary` `.btn--secondary` `.btn--ghost` `.btn--danger` + tamaño `.btn--sm` `.btn--md` `.btn--lg` + `.btn--icon`. Migrar oportunistamente (no en una sola PR).
- **O bien**: el `Button.tsx` planeado pero no hecho aún en la fase 1 — retomar.

### 8.2 `ghost icon-only` sin CSS · Prioridad **alta**
- [CustomerWorkspace.tsx] usa esa combo pero `.icon-only` no existe en styles.css. Cae a `ghost` solo.
- **Solución:** definir la regla (`.btn--icon` cuadrado, sin padding lateral) o eliminar la combinación.

### 8.3 Botón con SVG sin alt accesible · Prioridad **media**
- Varios botones icon-only sin `aria-label`. Lucide se renderiza con `aria-hidden`, pero el botón mismo necesita label.
- **Solución:** revisar y añadir `aria-label` donde falte.

---

## 9. Tablas

### 9.1 No hay `<table>` real; todo card-row · Prioridad **media**
- **Problema:** para densidad de datos (listas largas de informes, partners, clientes) las tarjetas son menos eficientes que tablas.
- **Solución:** considerar una **vista doble** "card / table" toggleable en escritorio para `ReportList`. En móvil siempre card. Sin tocar backend.
- **Cambio:** estructural pero opcional. Marcar para fase 2.

---

## 10. Empty states / Loading

### 10.1 Buena cobertura · Prioridad **baja** (positivo)
- `EmptyState` usado en 8+ archivos; `SkeletonBlock` cubre los editores.

### 10.2 Faltan en `PhotoAnnotatorLite` y `AdminPanel` · Prioridad **media**
- Datos vacíos quedan como áreas en blanco.
- **Solución:** envolver con `EmptyState` cuando `items.length === 0`.

### 10.3 SaveStatusBadge ya en buen estado · positivo
- Tras la fase 1 quedó con AnimatePresence + lucide. Mantener.

---

## 11. Responsive

### 11.1 10 breakpoints distintos sin sistema · Prioridad **media**
- `styles.css` mezcla 480, 540, 600, 640, 720, 768, 960, 1023, 1180.
- **Solución:** consolidar a 3 breakpoints (`sm: 600`, `md: 900`, `lg: 1180`) y migrar reglas. Las queries dispares las introdujeron distintos features; ahora cuesta mantenerlas.

### 11.2 Sin reglas móviles en `AdminPanel`, `CustomerWorkspace`, formularios CRUD · Prioridad **alta**
- **Impacto UX:** móviles ven layouts desktop apilados raros. La app dice "PWA" pero **no es realmente usable en 380 px** en esas pantallas.
- **Solución:** auditar cada uno con preview a 390 px y añadir media queries. Sólo CSS.

### 11.3 Touch targets <44 px en algunos botones icon-only · Prioridad **media**
- `.ann__tbtn` mide 34 px. Apple recomienda 44 px mínimo.
- **Solución:** en móvil, aumentar a 44 px.

---

## 12. Z-index / overlays

### 12.1 Escala desordenada · Prioridad **media**
| Valor | Usado por | Comentario |
|------|-----------|-----------|
| 9999 | `.toast-container` | Excesivo; basta 1000 |
| 500 | `.leck-page` | OK (full-screen) |
| 200 | `.pwa-install-banner` | **Conflicto**: queda encima del Dialog (80) |
| 90 | `.command-palette` | Por encima de Dialog → correcto |
| 80 | `.dialog-root` | Demasiado bajo |
| 45 | `.command-palette-root` | Inconsistente con .command-palette |
| 24-25 | navegación interna | OK |

- **Solución:** definir tokens en `:root`:
  ```
  --z-base: 1;
  --z-dropdown: 50;
  --z-banner: 100;
  --z-modal: 200;
  --z-palette: 300;
  --z-toast: 400;
  --z-overlay-full: 500;
  ```
  y migrar.

---

## 13. Tipografía / spacing / superficies

### 13.1 Tokens nuevos (post fase 1) infrautilizados · Prioridad **media**
- `--space-*`, `--text-*`, `--ease-out`, `--dur-base` existen pero la mayoría de bloques de `styles.css` siguen usando rems mágicos (`0.35rem`, `0.45rem`, `0.85rem`, `1.05rem`).
- **Solución:** sweep oportunista: cada vez que se toca un componente, migrar sus valores al token más cercano. No big bang.

### 13.2 `Manrope` muy bien escogida · positivo
- Mantener. Usar `--leading-tight` y `--leading-normal` para titulares vs cuerpo.

---

## 14. Calendario en email / SMTP editor

### 14.1 `smtp-button-primary` con `#0f172a` hardcoded · Prioridad **media**
- **Problema:** [SmtpTemplateEditor.tsx](app/src/components/SmtpTemplateEditor.tsx) introduce su propia paleta (casi negro azulado).
- **Solución:** sustituir por `var(--primary-strong)` o un token nuevo para superficies oscuras.

---

## 15. Plan de acción

### A. Quick wins (≤ 1 día cada uno)

| # | Tarea | Archivos | Prioridad |
|---|------|---------|----------|
| Q1 | Sustituir SVG inline de mapa por lucide `MapPin` | [ClientManager.tsx:18-23](app/src/components/ClientManager.tsx) | baja |
| Q2 | Añadir `aria-label` a todos los botones icon-only | varios | media |
| Q3 | Skeleton de lista para `ReportList` cargando | [ReportList.tsx:831-839](app/src/components/ReportList.tsx) | media |
| Q4 | `.report-row` colapsa a columna en `@media (max-width: 600px)` | [styles.css](app/src/styles.css) | alta |
| Q5 | `.grid.three` y `.grid.two` a 1fr en móvil | [styles.css](app/src/styles.css) | alta |
| Q6 | Definir `.btn--icon` / `.btn--sm` y eliminar `.smtp-button-primary` y `.cal-detail__btn` | [styles.css](app/src/styles.css), `SmtpTemplateEditor.tsx`, `EventDetailModal.tsx` | alta |
| Q7 | Tokens `--z-*` y migrar las 7 escalas inconsistentes | [styles.css](app/src/styles.css) | media |
| Q8 | Toast para seed de partners | [PartnerManager.tsx](app/src/components/PartnerManager.tsx) | baja |
| Q9 | `cursor: grab` y hint en `WeekGrid` para drag | calendar | media |
| Q10 | `.dialog-footer-actions` con orden+gap unificado | [styles.css](app/src/styles.css) + 5 callers | media |

### B. Cambios estructurales (≤ 1 semana)

| # | Tarea | Archivos | Prioridad |
|---|------|---------|----------|
| S1 | Extraer `ClientFormFields.tsx` y `PartnerFormFields.tsx`, eliminar duplicación | `ClientManager.tsx`, `PartnerManager.tsx`, nuevos | **alta** |
| S2 | Sweep `AdminPanel.tsx` (69 inline styles) → BEM `.admin-panel__*` | [AdminPanel.tsx](app/src/components/AdminPanel.tsx), styles.css | **alta** |
| S3 | Sweep `CustomerWorkspace.tsx` (19 inline) → clases | [CustomerWorkspace.tsx](app/src/components/CustomerWorkspace.tsx) | **alta** |
| S4 | Sweep `PartnerManager.tsx` (15 inline) → `.partner-manager__*` | [PartnerManager.tsx](app/src/components/PartnerManager.tsx) | alta |
| S5 | Componente `Button.tsx` unificando 6 variantes y migración oportunista | nuevo `ui/Button.tsx` + callers | alta |
| S6 | `AppShell.tsx` con breadcrumbs + back persistente para no-Leckortung | `App.tsx`, nuevo | media |
| S7 | Validación inline (onBlur) en Leckortung + Cliente + Partner | esos 3 forms | media |
| S8 | Consolidar 10 breakpoints → 3 (`sm`/`md`/`lg`) | [styles.css](app/src/styles.css) | media |
| S9 | Unificar Leckortung modal/page (mismas clases visuales) | `LeckortungFormModal.tsx`, `LeckortungPage.tsx` | media |
| S10 | Vista tabla/card toggle en `ReportList` para densidad en desktop | [ReportList.tsx](app/src/components/ReportList.tsx) | baja |

---

## 16. Resumen visual de áreas

| Área | Estado actual | Severidad combinada |
|------|---------------|---------------------|
| **AppShell / nav** | conmutación if-else sin shell | media |
| **Leckortung form** | helpers compartidos OK, chrome todavía duplicado | media |
| **Editor de informe** | sólido (post fase 1), falta indicador de campos por paso | baja |
| **Calendario** | OK funcional, skeleton y filtros mejorables | media |
| **Clientes** | duplicación crear/editar, sin móvil | **alta** |
| **Partners** | inline-style hell, sin móvil | **alta** |
| **Lista de informes** | flujo OK, mobile-card y skeleton faltan | media |
| **Modales** | sistema Dialog unificado ✓ | baja |
| **Botones** | 6 variantes ad-hoc | **alta** |
| **Tablas** | no existen como tales; card-rows mal en móvil | media |
| **Empty / loading** | bien cubierto en general | baja |
| **Responsive** | 10 breakpoints; AdminPanel/Customer/Partner sin móvil | **alta** |
| **Z-index** | escala desordenada con conflicto banner vs dialog | media |
| **Tokens** | nuevos pero infrautilizados | media |

---

## 17. Restricciones respetadas

- ✅ Cero cambios a `functions/`, schema, Firebase rules, auth.
- ✅ Cero modificaciones de contratos backend.
- ✅ Sólo recomendaciones; no se aplicaron cambios todavía (queda pendiente la aprobación de las tareas Q1-Q10 y S1-S10 antes de ejecutar).

---

**Sugerencia de orden de ejecución:**
1. Quick wins Q4, Q5, Q6 (impacto móvil + botones, 1 día).
2. S5 Button system (desbloquea Q6 completo).
3. S2, S3, S4 sweeps de inline styles (mayor mejora percibida).
4. S1 extracción forms (paga deuda técnica).
5. S6 AppShell + S8 breakpoints (pulido final).

Cuando confirmes prioridades, ejecutamos por bloques.

---

# 18. Addendum — Auditoría en vivo (preview con credenciales reales)

> Tras login con `ai@ai.ai`, hice un recorrido completo en desktop (1440×900) y móvil (390×844), tomando screenshots y midiendo elementos con `preview_eval`. Esto **corrige y prioriza** parte del informe anterior, que estaba basado sólo en el código.

## 18.1 Correcciones al informe inicial

- ❌ **NO es cierto** que "no existe AppShell": el app sí tiene `app-shell` + `app-rail` (sidebar persistente con badges de conteo) + `app-bottom-nav` (móvil) + `app-drawer` (móvil). Ya está montado en `App.tsx`. La sección 1.1 del informe queda obsoleta.
- ❌ El brand de la app es **AquaRadar**, no "26german" — la marca aplica dinámicamente y se ve en topbar + sidebar.
- ❌ **CustomerWorkspace** (el "Clientes" real, no `ClientManager.tsx`) **sí tiene** layout responsive y cards con avatar/contadores/agenda. Es de las pantallas más pulidas. El problema descrito en §4 se aplica al *legacy* `ClientManager.tsx`, no a la pantalla actual.
- ✅ La sidebar tiene un `app-drawer__panel` con `transform: translateX(-360px)` para esconderlo en móvil; en mi sesión inicial el viewport se había roto a 2 px y por eso veía "...dar" cortado en el screenshot — **no es un bug real** a anchos correctos.

## 18.2 Hallazgos críticos nuevos (no detectados en el código)

### 🔴 C1. "Eliminar" usa color **PRIMARIO** en lista de informes — **prioridad ALTA**
- **Dónde:** vista **Trabajo** → cada fila tiene `Abrir` (link de texto) + `Eliminar` (botón sólido azul `rgb(19, 95, 150)`).
- **En móvil**: peor todavía — `Eliminar` es un botón **ancho completo, alto, azul sólido** debajo de `Abrir` (que es texto plano). Visualmente, lo destructivo es la acción principal.
- **Inconsistencia:** en `Admin → Usuarios` ese mismo "Eliminar" sí es outline rojo correcto.
- **Solución rápida:** sustituir el `<button>` de "Eliminar" en `ReportList.tsx` por `className="btn-danger"` o `.btn--danger` outline. Reordenar para que "Abrir" sea el primario y "Eliminar" el ghost destructivo (o icono `Trash2` con `aria-label`).
- **Archivos:** [app/src/components/ReportList.tsx](app/src/components/ReportList.tsx).

### 🔴 C2. **Idioma mezclado** en el editor de informes — **prioridad ALTA**
- **Dónde:** abrí un informe "AcroForm" y la UI muestra `Spanish` + **alemán** mezclados:
  - "CHECKLISTE Ablaufstatus" (alemán como título de panel)
  - Etiquetas de estado: **"Aktiv"**, **"Offen"**, **"Blockiert"** (alemán) cuando el idioma de UI es ES
  - Botón principal del wizard: **"Nächster Schritt"** (alemán) entre "Anterior" y "Guardar ahora" (español)
- **Impacto UX:** rompe la confianza completamente; parece app sin terminar.
- **Solución:** auditar `TemplateDrivenReportEditor.tsx` y el componente de checklist lateral para asegurar que pasan por `translate(language, de, es)` igual que el resto.
- **Archivos:** [app/src/components/TemplateDrivenReportEditor.tsx](app/src/components/TemplateDrivenReportEditor.tsx) y panel "Ablaufstatus" (revisar para localizarlo).

### 🔴 C3. **Logos de empresa rotos** en el paso 1 del editor — **prioridad ALTA**
- **Dónde:** Editor → Paso 1 "Empresa destinataria". 6 de 7 tarjetas (`SVT`, `Angerhausen`, `AquaRADAR`, `Hermann SBR`, `HOMEKONZEPT`, `Wasa-T`) muestran el alt text `logo/svt.png`, `logo/angerhausen.png`, etc. Sólo `Brasa` carga su imagen.
- **Causa probable:** rutas de Storage erróneas o falta de upload en esos paths para el tenant actual.
- **Impacto UX:** el usuario tiene que adivinar qué empresa es; corrompe el momento "elige tu marca", que es el primer click del flujo.
- **Solución:** fallback de imagen → renderizar las iniciales en un círculo de color cuando la URL devuelve 404; añadir `onError` al `<img>`.
- **Archivos:** búsqueda por `company-grid` / `companyOptions` (probablemente en `constants.ts` + el editor).

### 🟠 C4. Las mejoras de fase 1 (autosave premium, auto-advance, ⌘K) **NO aplican al editor real** — **prioridad ALTA**
- **Dónde:** el informe que abrí es plantilla **AcroForm** → ruta `TemplateDrivenReportEditor.tsx`, no la `ReportEditor.tsx` que toqué en la fase 1.
- **Síntoma:** no veo el toggle `Auto-Weiter/Auto-avance`, no veo `SaveStatusBadge` mejorado (sólo el chip "Sin cambios" arriba), pero **sí veo** la barra de shortcut hints abajo (`K Comandos · S Guardar · ←/→ · Esc`) y el `ProgressStepper` con motion (mantiene la línea conectada y los iconos lucide).
- **Conclusión:** parte del estilo nuevo se propaga (vía CSS global), pero la lógica (auto-advance, palette wired) sólo vive en `ReportEditor.tsx` para plantillas "svt" / "leckortung". Las plantillas AcroForm — que son la mayoría — quedan en la versión antigua.
- **Solución estructural:** extraer la lógica (hook `useAutoAdvance`, mount de `CommandPalette`, `SaveStatusBadge`) a un wrapper que **ambos** editores monten. O migrar el flujo de stepper completo a `TemplateDrivenReportEditor`.
- **Archivos:** [app/src/components/ReportEditor.tsx](app/src/components/ReportEditor.tsx), [app/src/components/TemplateDrivenReportEditor.tsx](app/src/components/TemplateDrivenReportEditor.tsx).

### 🟠 C5. **PartnerManager** sigue siendo la peor pantalla — **prioridad ALTA**
- **Confirmación visual:** filas pale beige/crema con bordes rojos, botones `Eliminar` rojos sólidos enormes, `Editar` como link de texto, formulario derecho **sin card wrapper** (inputs sueltos sobre el fondo). Cero alineación con el resto.
- **Tabs "Nuevo partner" / "Cargar partners iniciales"** son pills azul oscuro sólidas, no la pill de la app.
- **Solución:** ver §S4 del plan original — sweep + tokens. Es el ítem con mayor impacto visual por esfuerzo.
- **Archivos:** [app/src/components/PartnerManager.tsx](app/src/components/PartnerManager.tsx).

### 🟠 C6. Página **Hoy** mezcla dos paletas — **prioridad MEDIA**
- **Dónde:** hero card grande azul oscuro (`Operativa de oficina`) + 3 tarjetas "Prioridades de hoy" en **peach / blue / mint** (paleta cálida totalmente nueva no usada en ninguna otra pantalla).
- **Impacto:** sensación de "página marketing" injertada dentro de una herramienta operativa. Distrae del flujo del técnico.
- **Solución:** o aplicar la paleta cálida también en Trabajo/Visitas/Clientes (decisión de marca), o reemplazar las 3 tarjetas con el `SectionCard` estándar tonal azul/teal. Recomendación: simplificar.
- **Archivos:** la pantalla "Centro de hoy" (`HomeDashboard.tsx` según el inventario).

### 🟠 C7. Lista de informes: **primera fila vacía** sin diferenciar — **prioridad MEDIA**
- **Dónde:** Trabajo. La primera entrada muestra sólo "12/5/2026, 21:27:41" + Borrador + acciones. Sin proyecto, sin ubicación, sin nombre. No queda claro si es un informe corrupto, abandonado o nuevo recién creado.
- **Solución:** mostrar etiqueta `Sin título · Borrador iniciado hace X min`, en color muted, con CTA "Completar" en lugar de "Abrir".

### 🟡 C8. Estado "Sin cambios" en chip de guardado — **prioridad BAJA**
- **Dónde:** Editor, chip arriba a la derecha. Cuando el informe acaba de cargar y no se ha tocado, dice "Sin cambios" — confuso semánticamente, da impresión de "no se ha guardado nada".
- **Solución:** sustituir por "Sincronizado" o quitar el chip cuando `state==='idle'` y `lastSavedAt` está vacío.

### 🟡 C9. Bottom-nav móvil: tab activo se confunde — **prioridad BAJA**
- **Síntoma:** después de navegar, el highlight del tab queda en Admin aunque el contenido cambie a Hoy. Posible bug de estado o que el cambio no propaga el `active` correctamente.
- **Solución:** verificar `app-bottom-nav__item.active` en cada navegación, usar prop derivada del state actual.

### 🟡 C10. Banner verde "Vista de solo lectura" — **prioridad BAJA**
- **Dónde:** Editor para roles oficina/admin viendo informe ajeno.
- **Problema:** el verde sugiere éxito/positivo; en realidad es un **aviso informativo** ("no puedes editar"). Debería ser tono neutro o info azul, no verde success.
- **Archivos:** [ReportEditor.tsx](app/src/components/ReportEditor.tsx), `.notice-banner.notice` en `styles.css`.

### 🟡 C11. Calendario semanal con horas vacías 07:00-12:00 — **prioridad BAJA**
- **Dónde:** Visitas → Semana. La cuadrícula muestra slots desde 07:00 pero el primer evento del día arranca a las 13:00, dejando 6 horas en blanco arriba.
- **Solución:** auto-scroll al primer evento del día (o a `now()`) al cargar la vista; o colapsar bloques sin eventos.

### 🟡 C12. Editar/Activar/Desactivar en Usuarios — **prioridad BAJA**
- **Dónde:** Admin → Usuarios. Acciones "Desactivar" + "Eliminar" como text-link y outline-red respectivamente. Para roles "Yo" (uno mismo) están deshabilitados pero el contraste de "Desactivar" disabled es bajo.
- **Solución:** `aria-disabled` + opacity 0.4 sólo en la fila propia.

## 18.3 Cosas que **sí** están muy bien

- **Sidebar persistente** con badges de cantidades (`Clientes 5`, `Trabajo 19`) — premium feel logrado.
- **CustomerWorkspace** (Clientes) — la pantalla más pulida; cards de cliente con stats inline, search bar grande, hero con métricas. Esto debería ser **la referencia visual** para Trabajo y Partners.
- **Visitas / Calendario** — vistas Hoy/Semana/Mes/Agenda con filtros funcionales; layout limpio.
- **Admin Dashboard** — KPIs en 4 cards + status cards SMTP/IA + sub-cards de distribución. Profesional.
- **Admin → Apariencia** — selector de color primario en tiempo real con swatches + hex input. Muy bien hecho.
- **Bottom-nav móvil** con iconos lucide y labels — touch-friendly.
- **Fase 1 (post upgrade):** stepper con motion + shortcut hints visibles + back arrow con lucide.

## 18.4 Re-priorización tras la auditoría en vivo

Orden recomendado para ejecutar (de mayor impacto a menor):

| # | Tarea | De dónde sale | Prioridad final |
|---|-------|---------------|-----------------|
| 1 | **Botón Eliminar destructivo en ReportList** (sustituir azul por outline rojo + reordenar) | C1 | 🔴 **ALTA** |
| 2 | **Localizar Ablaufstatus + Nächster Schritt** | C2 | 🔴 **ALTA** |
| 3 | **Fallback de logo en company-grid** (iniciales en círculo) | C3 | 🔴 **ALTA** |
| 4 | **Migrar auto-advance + ⌘K + SaveStatusBadge a TemplateDrivenReportEditor** | C4 | 🔴 **ALTA** |
| 5 | **Sweep PartnerManager** (BEM + remover beige + form en card) | C5 + S4 | 🔴 **ALTA** |
| 6 | **Sistema unificado de botones** (`.btn--*`) — desbloquea #1 | S5 | 🔴 **ALTA** |
| 7 | **Editor: tarjeta "Vista de solo lectura" tono info, no success** | C10 | 🟡 baja, junto a 1 |
| 8 | **Lista de informes: fila vacía con CTA "Completar"** | C7 | 🟠 media |
| 9 | **Hoy: simplificar paleta de "Prioridades"** o asumirla en toda la app | C6 | 🟠 media |
| 10 | **Móvil: bottom-nav active state** | C9 | 🟡 baja |
| 11 | **Calendario: auto-scroll a hora actual o primer evento** | C11 | 🟡 baja |
| 12 | **Chip "Sin cambios" → ocultarlo en idle inicial** | C8 | 🟡 baja |

**Resumen:** la app está **mejor** de lo que el código sugería, pero tiene tres dolores que tiran abajo la percepción premium **inmediatamente al primer minuto de uso**:

1. Eliminar con color de acción primaria (C1) — un mal click destructivo a un toque.
2. Idioma mezclado en el editor (C2) — sensación de software inacabado.
3. Logos rotos (C3) — la primera pantalla del wizard llena de alt text.

Si sólo hubiera tiempo para 3 cambios este sprint: **#1, #2, #3** de la tabla.

---

## 19. Capturas tomadas

Para referencia, durante esta auditoría se capturaron:

- Login screen (post fase 1).
- Hoy / Centro de hoy (desktop + móvil).
- Clientes / CustomerWorkspace (desktop + móvil).
- Visitas / Calendario semana (desktop).
- Trabajo / Lista de informes (desktop + móvil scrolled).
- Admin / Dashboard (desktop).
- Admin / Usuarios (table view).
- Admin / Partners / Empresas (legacy pain point).
- Admin / Apariencia (color picker).
- Admin / Email / SMTP.
- Editor de informe (AcroForm template, paso 1).

Todas confirmaron los hallazgos arriba.

