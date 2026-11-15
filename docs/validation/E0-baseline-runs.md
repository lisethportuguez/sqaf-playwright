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

## Serie 1: commit `b9ddac5` (invalidada por defecto de automatización)

| Corrida | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped |
|---|---|---|---|---|---|---|
| 1 | 06:14:45 | 36.4 s | 4 | 1 (TC9) | 0 | 0 |
| 2 | 06:15:23 | 30.0 s | 4 | 1 (TC9) | 0 | 0 |
| 3 | 06:15:54 | 33.9 s | 4 | 1 (TC9) | 0 | 0 |

**Causa:** TC9 hacía clic en `#submit_search` antes del evento `load`. El botón depende de un *handler* de jQuery y el clic se ignoraba (`Searched Products` no aparecía).
**Clasificación:** fallo de **automatización**. No es un fallo funcional del SUT ni de infraestructura.
**Evidencia de la causa:** con `--repeat-each=6 --workers=1`, antes de la corrección: 4 fallos y 2 éxitos. Después de agregar `waitForLoadState('load')`: 6 de 6 éxitos.
**Corrección:** commit `41d3196`.

> Durante el desarrollo (antes de la serie 1) se detectó el mismo defecto en TC12 ("Add to cart"): 4 de 6 fallos con `--repeat-each=6`, 6 de 6 éxitos tras la misma corrección. Se corrigió antes del commit `b9ddac5`.

## Serie 2 (oficial): commit `41d3196`

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

Pendiente: requiere configurar el repositorio remoto.
