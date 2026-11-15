# Registro de ejecuciones — Etapa 0 (línea base)

> Datos reales, sin editar. Las conclusiones comparativas corresponden a la Etapa 7.

Este registro contiene dos tipos de ejecución:

- **Seis corridas experimentales locales** (series 1 y 2). Sus evidencias crudas están en `metrics/experiments/E0-baseline/`.
- **Tres ejecuciones remotas de verificación** en GitHub Actions. Validan el pipeline de CI y no forman parte de la serie experimental.

## Condiciones de ejecución (corridas locales)

| Variable | Valor |
|---|---|
| Fecha | 2026-11-15 (horas en UTC) |
| Entorno | Local: Windows 11, Node.js v26.13.1, npm 11.20.0 |
| Herramientas | Playwright 1.65.0, TypeScript 7.0.2 |
| Navegador | Chromium (proyecto `baseline`) |
| Workers | 1 (`--workers=1`, igual que en CI) |
| Retries | 0 |
| Bloqueo de anuncios | Activo (`config/ad-blocking.ts`) |
| Unidad de análisis | 5 escenarios únicos × 1 navegador = 5 ejecuciones por corrida |
| Comando | `npx playwright test --project=baseline --workers=1 --reporter=json` |

## Serie 1: commit `b9d9ffa` (invalidada por defecto de automatización)

| Corrida | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped |
|---|---|---|---|---|---|---|
| 1 | 06:14:45 | 36.4 s | 4 | 1 (TC9) | 0 | 0 |
| 2 | 06:15:23 | 30.0 s | 4 | 1 (TC9) | 0 | 0 |
| 3 | 06:15:54 | 33.9 s | 4 | 1 (TC9) | 0 | 0 |

**Causa:** TC9 hacía clic en `#submit_search` antes del evento `load`. El botón depende de un *handler* de jQuery y el clic se ignoraba (`Searched Products` no aparecía).
**Clasificación:** fallo de **automatización**. No es un fallo funcional del SUT ni de infraestructura.
**Evidencia de la causa:** con `--repeat-each=6 --workers=1`, antes de la corrección: 4 fallos y 2 éxitos. Después de agregar `waitForLoadState('load')`: 6 de 6 éxitos.
**Corrección:** commit `86d33bb`.

> Durante el desarrollo (antes de la serie 1) se detectó el mismo defecto en TC12 ("Add to cart"): 4 de 6 fallos con `--repeat-each=6`, 6 de 6 éxitos tras la misma corrección. Se corrigió antes del commit `b9d9ffa`.

## Serie 2 (oficial): commit `86d33bb`

| Corrida | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped |
|---|---|---|---|---|---|---|
| 1 | 06:18:22 | 24.7 s | 5 | 0 | 0 | 0 |
| 2 | 06:18:48 | 29.3 s | 5 | 0 | 0 | 0 |
| 3 | 06:19:19 | 25.1 s | 5 | 0 | 0 | 0 |

### Duración por escenario (s)

| Escenario | Corrida 1 | Corrida 2 | Corrida 3 |
|---|---|---|---|
| TC1 Register User | 6.4 | 7.3 | 6.9 |
| TC3 Login incorrect | 3.7 | 3.4 | 3.9 |
| TC8 All Products / detail | 3.3 | 4.4 | 3.0 |
| TC9 Search Product | 4.4 | 4.2 | 4.6 |
| TC12 Add Products in Cart | 6.2 | 9.4 | 6.1 |

**Resultado:** 15 de 15 ejecuciones exitosas al primer intento (3 corridas × 5 escenarios). Tres corridas son una muestra insuficiente para conclusiones de estabilidad: la medición experimental se hará en la Etapa 7.

## Verificaciones complementarias

| Verificación | Resultado |
|---|---|
| Limpieza de TC1 cuando falla tras crear la cuenta (fallo forzado temporal, revertido) | El `afterEach` eliminó la cuenta. `GET /api/getUserDetailByEmail` devolvió `404 Account not found`. |
| Simulación del pipeline de CI en local (`npm ci` → `typecheck` → `CI=true npm run test:baseline`) | 5 de 5 pasaron (23.9 s) y se generó `playwright-report/index.html` |

## Ejecuciones remotas de verificación en GitHub Actions

Estas tres ejecuciones son distintas de las seis corridas experimentales locales (series 1 y 2). Su objetivo es **verificar el pipeline de CI** (criterios 7, 8 y 9), no producir datos experimentales. Por eso no se agregan a `metrics/experiments/E0-baseline/` ni a `summary.json`.

### Condiciones comunes

| Variable | Valor |
|---|---|
| Workflow | [`CI`](https://github.com/lisethportuguez/sqaf-playwright/actions/workflows/ci.yml) (`.github/workflows/ci.yml`) |
| Fecha | 2026-11-15 (horas en UTC) |
| Runner | GitHub-hosted `ubuntu-latest` (imagen `ubuntu-26.04`) |
| Node.js | v26.13.1 (resuelto desde `.nvmrc`) |
| Navegador | Chromium (Chrome for Testing 158.0.8127.18, Playwright chromium v1254) |
| Workers | 1 (log: `Running 5 tests using 1 worker` en las tres ejecuciones) |
| Retries | 0 |
| Pasos | `npm ci` → typecheck (`tsc --noEmit`) → instalación de Chromium → `npm run test:baseline` → subida del reporte HTML |

### Resultados por ejecución

| # | Run ID | Contexto | Evento / rama | Commit | Job (UTC) | TypeScript | Línea base (5 escenarios) | Artifact HTML |
|---|---|---|---|---|---|---|---|---|
| R1 | [`43689246937`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43689246937) | Primera validación del PR #1 | `pull_request`, `stage/0-bootstrap` → `main` | `89ea2b5` | 07:17:02–07:17:44 (42 s) | Aprobado (exit 0) | **5 passed (13.3 s)** | `playwright-report-43689246937-1` (220 172 bytes) |
| R2 | [`43690125007`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43690125007) | Validación tras la actualización documental | `pull_request`, `stage/0-bootstrap` → `main` | `96d06ee` | 07:28:58–07:29:41 (43 s) | Aprobado (exit 0) | **5 passed (13.1 s)** | `playwright-report-43690125007-1` (220 925 bytes) |
| R3 | [`43690457916`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43690457916) | Validación posterior al merge del PR #1 | `push` a `main` | `a2ea574` (merge) | 07:33:17–07:33:56 (39 s) | Aprobado (exit 0) | **5 passed (12.8 s)** | `playwright-report-43690457916-1` (199 952 bytes) |

Las tres ejecuciones son el intento 1, sin fallidos, flaky ni skipped. Los tres artifacts tienen 14 días de retención (hasta el 2026-11-29); se descargaron y se comprobó que cada uno contiene `index.html`.

### Duración por escenario (s)

| Escenario | R1 | R2 | R3 |
|---|---|---|---|
| TC1 Register User | 3.9 | 4.3 | 4.4 |
| TC3 Login incorrect | 1.3 | 1.4 | 1.2 |
| TC8 All Products / detail | 1.6 | 1.3 | 1.3 |
| TC9 Search Product | 2.0 | 1.5 | 1.9 |
| TC12 Add Products in Cart | 2.4 | 3.2 | 2.4 |

Avisos de la plataforma, presentes en las tres ejecuciones y sin efecto en el resultado:

- `actions/upload-artifact@v4` declara Node.js 20, que está obsoleto, y GitHub lo ejecuta forzado con Node.js 24.
- La etiqueta `ubuntu-latest` está migrando a Ubuntu 26.

> Estas ejecuciones verifican que el pipeline funciona, pero no permiten sacar conclusiones de estabilidad ni de rendimiento: esas corresponden a la Etapa 7. Las duraciones tampoco son comparables con las locales, porque el entorno es distinto.

## Estado de la Etapa 0

**Validated.** Las verificaciones locales están completas y las tres ejecuciones remotas de GitHub Actions (`43689246937`, `43690125007` y `43690457916`) fueron exitosas: instalación, typecheck, línea base en Chromium con 1 worker (5 de 5 escenarios) y reporte HTML publicado como artifact. La ejecución `43690457916` confirma el resultado en `main` después del merge del PR #1.

| Criterio de aceptación | Estado |
|---|---|
| 1. Git inicializado y estado inicial respaldado | Cumplido |
| 2. `package.json` configurado | Cumplido |
| 3. `npm run typecheck` con exit 0 | Cumplido |
| 4. Cinco escenarios de línea base implementados | Cumplido |
| 5. Ejecución correcta en Chromium | Cumplido (local) |
| 6. Tres ejecuciones locales consecutivas registradas | Cumplido (serie 2) |
| 7. GitHub Actions ejecuta instalación, typecheck y pruebas | Cumplido (runs R1, R2 y R3) |
| 8. Reporte HTML publicado como artifact | Cumplido (un artifact por run, R1–R3) |
| 9. Workflow con un worker | Cumplido (log de R1–R3: `using 1 worker`) |
| 10. Documentación de E0 actualizada | Cumplido |
| 11. Cambios registrados en Git | Cumplido (publicados en `stage/0-bootstrap`, PR #1) |

## Desviaciones aprobadas respecto al plan de E0

| Desviación | Justificación |
|---|---|
| `.gitattributes` | Normalizar los finales de línea (LF) entre Windows (local) y Linux (CI) |
| `config/ad-blocking.ts` | Aplicar la misma política de bloqueo en la línea base y en SQAF, separada de la lógica de los tests (ADR-0002) |
| `docs/validation/E0-baseline-runs.md` | Registrar las ejecuciones con fechas y condiciones (criterio 6) |
| Metadatos de `package.json` (`name: sqaf-playwright`, `private`, `engines`) | Coherencia con el nombre del repositorio y con la versión de Node validada |

## Evidencias crudas (JSON)

Las seis salidas del reporter JSON de Playwright (series 1 y 2) están en [`metrics/experiments/E0-baseline/`](../../metrics/experiments/E0-baseline/), como copias **saneadas** (sin rutas locales), con un `summary.json` y su documentación de clasificación y saneamiento. Los originales sin modificar se conservan fuera del repositorio, en una ubicación local privada, y se pueden verificar con los hashes SHA-256 de `summary.json`.

## Reescritura de identidad en el historial (2026-11-15)

Antes de la primera publicación se sustituyó la identidad de autor y committer de los seis commits de E0 por la dirección privada de GitHub (`@users.noreply.github.com`), con `git filter-branch`.

- Se conservaron el contenido (*tree* idéntico en los seis commits), las fechas de autor y de committer, el orden lineal y la relación entre ramas.
- El único cambio de mensaje fue sustituir una referencia a un hash antiguo por "the initial snapshot commit".

| Hash anterior | Hash nuevo | Tree (sin cambios) | Commit |
|---|---|---|---|
| `b415d37` | `6fea854` | `c916dc6` | chore: snapshot initial Playwright scaffold (`main`) |
| `b35ee92` | `953de9d` | `86c60f7` | build: configure TypeScript 7 strict typecheck… |
| `b9ddac5` | `b9d9ffa` | `b53a3c0` | test(baseline): add 5-scenario experimental baseline… |
| `41d3196` | `86d33bb` | `c5f5f97` | fix(baseline): wait for page load before jQuery-bound search in TC9 |
| `74e3a22` | `c03b565` | `f55ff6d` | ci: add GitHub Actions workflow… |
| `2bad66f` | `60c7465` | `dd11b52` | docs: add Stage 0 README, architecture, ADR-0001..0004… |
