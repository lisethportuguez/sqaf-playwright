# Registro de ejecuciones — Etapa 0 (línea base)

> Datos reales, sin editar. Las conclusiones comparativas corresponden a la Etapa 7.

## Condiciones de ejecución

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

## Ejecución en GitHub Actions

**Pendiente.** El repositorio remoto todavía no existe. No hay resultados de GitHub Actions.

## Estado de la Etapa 0

**Implemented.** Las verificaciones locales están completas. La etapa pasará a *Validated* solo cuando exista una ejecución exitosa en GitHub Actions (instalación, typecheck y línea base con 1 worker) y el reporte HTML publicado como artifact.

| Criterio de aceptación | Estado |
|---|---|
| 1. Git inicializado y estado inicial respaldado | Cumplido |
| 2. `package.json` configurado | Cumplido |
| 3. `npm run typecheck` con exit 0 | Cumplido |
| 4. Cinco escenarios de línea base implementados | Cumplido |
| 5. Ejecución correcta en Chromium | Cumplido (local) |
| 6. Tres ejecuciones locales consecutivas registradas | Cumplido (serie 2) |
| 7. GitHub Actions ejecuta instalación, typecheck y pruebas | **Pendiente** |
| 8. Reporte HTML publicado como artifact | **Pendiente** |
| 9. Workflow con un worker | Configurado. **Pendiente** de evidencia remota. |
| 10. Documentación de E0 actualizada | Cumplido |
| 11. Cambios registrados en Git | Cumplido (pendiente de publicar) |

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
