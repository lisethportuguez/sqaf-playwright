# Registro de validación — Etapa 1 (configuración y estructura base)

> Datos reales, sin editar. Rama `stage/1-configuration`, PR hacia `main`. Decisiones: [ADR-0005](../architecture/decisions/ADR-0005-configuration-layer.md) (configuración), [ADR-0006](../architecture/decisions/ADR-0006-infrastructure-failure-classification.md) (desafío anti-bot) y [ADR-0003](../architecture/decisions/ADR-0003-ci-github-actions.md) (CI).

## 1. Antecedente: incidentes del desafío anti-bot de Cloudflare

Después del cierre de E0, dos ejecuciones de CI sobre `main` fallaron por el desafío anti-bot de Cloudflare del SUT. Ninguna incluía cambios de código: los dos commits solo modificaban `docs/validation/E0-baseline-runs.md`.

| Run | Evento | Commit | Intento | Job (UTC) | TypeScript | Línea base | Artifact HTML | Resolución |
|---|---|---|---|---|---|---|---|---|
| [`43690859628`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43690859628) | `push` a `main` | `dc0bf7b` | 1 | 07:38:44–07:39:58 | Aprobado | **5 failed** (desafío) | `playwright-report-43690859628-1` | Reejecución del job fallido |
| [`43690859628`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43690859628) | (reejecución) | `dc0bf7b` | 2 | 07:43:42–07:44:18 | Aprobado | **5 passed** (10.5 s) | `playwright-report-43690859628-2` | — |
| [`43691579360`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43691579360) | `push` a `main` | `66be969` | 1 | 07:48:28–07:49:40 | Aprobado | **5 failed** (desafío) | `playwright-report-43691579360-1` | **No se relanzó** (decisión de la autora: la repetición ya estaba demostrada) |

- **Síntoma idéntico en ambos:** los cinco escenarios fallaron en su primera aserción, `toHaveTitle('Automation Exercise')`, con el valor recibido `"One moment, please..."`. El snapshot `error-context` mostraba `Please wait while your request is being verified...`.
- **Clasificación:** fallo de **infraestructura externa**. No es un defecto funcional del SUT ni un fallo de automatización.
- **Frecuencia ese día:** 2 de los 6 intentos de CI (runs `43689246937`, `43690125007`, `43690457916`, `43690859628` ×2 y `43691579360`).
- El primer incidente está documentado en detalle en [E0-baseline-runs.md](E0-baseline-runs.md#incidente-de-infraestructura-desafío-anti-bot-de-cloudflare). El segundo (`43691579360`) se registra aquí, como se autorizó, sin otro commit directo en `main`.
- Estado de `main` resultante: el último run de `main` (`43691579360`, commit `66be969`) quedó en *failure*. El tag `v0.1.0` apunta a `dc0bf7b`, cuyo run terminó en éxito en el intento 2.

> **Nota metodológica:** estos incidentes no son ejecuciones experimentales. No se incorporan a `metrics/experiments/E0-baseline/` ni modifican `summary.json`. Motivaron la detección y clasificación de la Etapa 1 (ADR-0006) y los filtros de rutas de CI (ADR-0003).

## 2. Decisiones implementadas

| Decisión aprobada | Implementación |
|---|---|
| Un único entorno inicial: `production` | `config/environments.ts` |
| Configuración centralizada y tipada | `config/index.ts` (`sqafConfig`, inmutable); `playwright.config.ts` solo la consume |
| Variables de entorno y `.env` opcional con `process.loadEnvFile()` | `config/environment.ts`, `.env.example`. Sin `dotenv`. El shell y CI prevalecen sobre `.env` |
| Timeouts centralizados | `config/timeouts.ts` (SQAF: 30 s / 5 s / 10 s / 30 s; línea base: 30 s / 5 s / 0 / 0) |
| Política centralizada de evidencias | `config/evidence.ts` (SQAF: trace y screenshot en fallos, video en fallos solo en CI; línea base: nada) |
| Línea base inmutable | Proyecto `baseline` con todas las condiciones de E0 explícitas y prueba de contrato |
| Detector anti-bot, `InfrastructureError` y reporter | `src/utils/anti-bot-detector.ts`, `src/errors/*`, `src/reporting/failure-classification-reporter.ts` |
| Pruebas unitarias del framework | Proyecto `unit` (`tests/unit`), script `npm run test:unit`, paso de CI |
| Firefox y WebKit definidos sin pruebas | Proyectos `firefox` y `webkit` sobre `tests/e2e` (vacío hasta E4) |
| CI: omitir la línea base en cambios solo documentales | `paths` en `push` y `pull_request`; `workflow_dispatch` sin filtro |
| Sin dependencias nuevas ni cambios de versión | `package-lock.json` sin cambios; en `package.json` solo se añadió el script `test:unit` |

### Relación entre `retries: 0` y `trace: 'on-first-retry'` (resuelta)

En E0 el trace global era `on-first-retry` y la línea base tenía `retries: 0`: nunca hubo un primer reintento, así que **nunca se grabó un trace** y el valor efectivo era `off`. E1 declara `trace: 'off'` en el proyecto `baseline`. El comportamiento efectivo no cambia; la prueba de contrato lo fija (ADR-0005).

## 3. Pruebas unitarias

`npm run test:unit`: **66 passed** (≈ 5 s, local). No usan navegador ni contactan el SUT.

| Área | Archivo | Qué cubre |
|---|---|---|
| Entorno | `config/environment.spec.ts` | Valores por defecto, variables vacías, `SQAF_ENV` inválido (incluidas claves heredadas como `toString`), `SQAF_BASE_URL` válido e inválido (7 casos), semántica de `CI`, `.env` que no sobrescribe |
| Configuración | `config/sqaf-config.spec.ts` | Inmutabilidad, timeouts, evidencias local/CI, condiciones de la línea base independientes del entorno |
| **Contrato de la línea base** | `config/baseline-contract.spec.ts` | Valores **efectivos** resueltos por Playwright (`--list` + reporter sonda) en local, CI y CI con `SQAF_*` definidos; valores declarados de `expect` y `workers`; ausencia de opciones globales; equivalencia trace/retries |
| Detección positiva | `utils/anti-bot-detector.spec.ts` | Página observada, solo título, solo cuerpo, espacios, mayúsculas y elipsis Unicode |
| Detección negativa | `utils/anti-bot-detector.spec.ts` | Página real del SUT y otros títulos del SUT |
| Coincidencias parciales | `utils/anti-bot-detector.spec.ts` | 5 títulos y 4 textos parciales que **no** deben detectarse |
| Guard | `errors/anti-bot-guard.spec.ts` | `InfrastructureError` con categoría `infrastructure`, clasificación `infrastructure/anti-bot-challenge`, prefijo, URL y evidencia |
| Clasificación | `errors/failure-classification.spec.ts` | Mensaje real de CI, con colores ANSI, snapshot, `InfrastructureError`; sin falsos positivos (incluido el fallo de automatización real de TC9 en E0) |
| **Preservación del estado fallido** | `reporting/failure-classification-reporter.spec.ts` | Ejecución hija real con 4 muestras: exit code 1, 3 `failed` según el reporter JSON de Playwright, 2 de infraestructura y 1 sin clasificar; consola y `GITHUB_STEP_SUMMARY`; con `retries: 1`, exactamente 2 intentos por fallo y 0 flaky; `onEnd` no devuelve estado |
| Filtros de CI | `ci/workflow-paths.spec.ts` | Listas idénticas en `push` y `pull_request`, exclusión de documentación, reinclusión de rutas críticas después de las exclusiones, `workflow_dispatch` sin filtro, orden typecheck → unit → baseline |

### Mutaciones controladas

Para comprobar que las pruebas detectan regresiones, se introdujeron cambios temporales (revertidos y verificados con `cmp`):

| Mutación | Pruebas que fallaron |
|---|---|
| El reporter devuelve `{ status: 'passed' }` en `onEnd` | 2 |
| Línea base con `trace: 'on-first-retry'` y `expect` de 10 s | 5 |
| El detector acepta títulos que *contienen* el título del desafío | 2 |
| `src/**` reincluido antes de la exclusión de Markdown en `pull_request` | 2 |

## 4. Verificación de la línea base después de E1

Tres corridas locales con el mismo comando y las mismas condiciones que E0. **No son datos experimentales**: se guardan aparte, en [`metrics/verification/E1-baseline-check/`](../../metrics/verification/E1-baseline-check/).

| Corrida | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped |
|---|---|---|---|---|---|---|
| E1-1 | 08:08:34 | 53.4 s | 5 | 0 | 0 | 0 |
| E1-2 | 08:09:29 | 61.4 s | 5 | 0 | 0 | 0 |
| E1-3 | 08:10:32 | 50.8 s | 5 | 0 | 0 | 0 |
| Control (`v0.1.0`) | 08:11:49 | 45.3 s | 5 | 0 | 0 | 0 |

| Escenario (s) | E1-1 | E1-2 | E1-3 | Control |
|---|---|---|---|---|
| TC1 Register User | 11.5 | 16.6 | 12.1 | 11.4 |
| TC3 Login incorrect | 10.1 | 6.2 | 10.7 | 8.5 |
| TC8 All Products / detail | 9.2 | 8.3 | 4.7 | 8.2 |
| TC9 Search Product | 8.6 | 21.2 | 8.7 | 6.0 |
| TC12 Add Products in Cart | 13.4 | 8.5 | 14.0 | 10.5 |

- **Resultado:** 15 de 15 ejecuciones exitosas al primer intento con el código de E1.
- **Duraciones:** fueron casi el doble que en la serie oficial de E0 (25–29 s). La corrida de control con el código exacto de `v0.1.0`, ejecutada a continuación, también fue lenta (45.3 s). El aumento se atribuye al entorno (SUT o red), no a E1, y las duraciones no se comparan con las de E0.

## 5. Verificación en GitHub Actions

### 5.1 Pipeline del PR #2

| Dato | Valor |
|---|---|
| Run | [`43693825486`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43693825486) (intento 1), workflow [`CI`](https://github.com/lisethportuguez/sqaf-playwright/actions/workflows/ci.yml) |
| Evento | `pull_request` (PR #2, `stage/1-configuration` → `main`) |
| Commit | `7f3b4bf` |
| Job (UTC) | 2026-11-15, 08:17:48–08:18:50 (62 s) |
| Entorno | `ubuntu-latest` (imagen `ubuntu-26.04`), Node.js v26.13.1 |

| Paso | Resultado |
|---|---|
| `npm ci` | Aprobado |
| Typecheck | Aprobado (exit 0) |
| Pruebas unitarias | **66 passed (6.3 s)**, 1 worker |
| Instalación de Chromium | Aprobado |
| Línea base | **5 passed (14.4 s)**, Chromium, 1 worker |
| Reporte HTML | Artifact `playwright-report-43693825486-1` (223 052 bytes) |
| Evidencias de fallo | Omitido (`skipped`): no hubo fallos |
| Clasificación | Consola: `[SQAF] Failure classification: no failed attempts.` tras las pruebas unitarias y tras la línea base |

- El resumen del job (`GITHUB_STEP_SUMMARY`) no se puede consultar por la API de GitHub. Su escritura está cubierta por las pruebas unitarias (ejecución hija con `GITHUB_STEP_SUMMARY` apuntando a un archivo); la comprobación visual en la pestaña *Actions* queda a cargo de la revisión.
- El artifact `failure-evidence-*` no se generó porque no hubo fallos. Su configuración se verificará con el primer fallo real.

### 5.2 Filtros de rutas con eventos reales

Se abrieron dos PR temporales en borrador contra `stage/1-configuration`, cada uno con un único archivo nuevo. Ambos se cerraron sin merge y sus ramas temporales se eliminaron.

| PR | Rama (commit) | Archivo modificado | Esperado | Observado |
|---|---|---|---|---|
| #3 | `tmp/ci-filter-docs-only` (`1450e07`) | `docs/tmp-ci-filter-check.md` | Sin run | **Sin run** (comprobado ~1 min después de crear el PR; `pull_request` se dispara en segundos, como muestra el PR #4) |
| #4 | `tmp/ci-filter-critical-md` (`d8013f7`) | `config/tmp-ci-filter-check.md` | Run (reinclusión de `config/**`) | **Run [`43693988709`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43693988709) creado de inmediato**, cancelado durante "Set up Node.js": no se ejecutaron el typecheck ni la línea base, así que no se contactó el SUT |

- El caso positivo general (cambios de código) lo demuestra el run `43693825486` del PR #2.
- `push` a `main` usa la misma lista que `pull_request` (verificado por `tests/unit/ci/workflow-paths.spec.ts`). Su comportamiento con eventos reales se observará en el merge, que incluye código y por lo tanto debe disparar CI.
- La ejecución manual (`workflow_dispatch`) no tiene filtro (verificado por la prueba unitaria) y no se lanzó para no contactar el SUT sin necesidad.

## 6. Desviaciones respecto del plan aprobado

| Desviación | Justificación |
|---|---|
| `paths` con exclusiones y reinclusiones en lugar de `paths-ignore` | `paths-ignore` no permite reincluir rutas: un `.md` en `src/` o `config/` quedaría excluido, contra el requisito de que esas rutas siempre disparen CI |
| El guard (`assertNoAntiBotChallenge`) está en `src/errors/anti-bot-guard.ts`, no en `src/utils/` | Mantener la regla de dependencias: `utils` nunca importa `errors` |
| Archivo adicional `src/errors/failure-classification.ts` | Función pura de clasificación, separada del reporter para probarla sin Playwright |
| Archivos de soporte de pruebas (`tests/unit/support/`) | Ejecutar Playwright en procesos hijos (sonda de configuración y muestras sintéticas) sin navegador ni SUT |
| Prueba unitaria de los filtros de CI (`tests/unit/ci/workflow-paths.spec.ts`) | Requisito de verificar los filtros mediante pruebas |
| Evidencias en `metrics/verification/E1-baseline-check/` | Conservar las corridas de verificación separadas de los experimentos históricos |
| Corrida de control con `v0.1.0` | Distinguir el efecto del entorno del efecto del código en las duraciones |
| `workers: 1` declarado en el proyecto `baseline` | Igualar en local la condición de 1 worker sin depender de `--workers=1`; las corridas registradas usan el mismo comando que E0 |
| El reporter escribe `reports/failure-classification.json` también con `--list` | Efecto inocuo: el archivo indica que no hubo intentos fallidos |

## 7. Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | `npm run typecheck` con exit 0 | Cumplido (local) |
| 2 | Toda la configuración se obtiene de `config/index.ts`; sin URL escrita directamente en `playwright.config.ts` | Cumplido |
| 3 | `SQAF_ENV` o `SQAF_BASE_URL` inválidos producen un error claro antes de ejecutar pruebas | Cumplido (pruebas unitarias) |
| 4 | `.env.example` documentado; ningún `.env` ni secreto versionado | Cumplido |
| 5 | Política de evidencias local/CI; evidencias de fallos como artifact en CI | Cumplido en configuración; artifact en CI pendiente de un fallo real |
| 6 | La línea base conserva las condiciones de E0 (contrato) y pasa 3 corridas locales | Cumplido (contrato y 3 × 5/5) |
| 7 | El detector reconoce las firmas reales y no da falsos positivos | Cumplido (pruebas unitarias) |
| 8 | Un fallo por desafío se clasifica como infraestructura y sigue contando como fallo | Cumplido (pruebas unitarias con ejecución real de Playwright) |
| 9 | CI ejecuta typecheck, pruebas unitarias y línea base, y publica los artifacts | Cumplido (run `43693825486`; reporte HTML publicado; `failure-evidence-*` pendiente de un fallo real) |
| 10 | Sin dependencias nuevas ni cambios de versión; `package-lock.json` sin cambios | Cumplido |
| 11 | ADR-0005, ADR-0006, ADR-0003, `architecture.md`, README y este registro actualizados | Cumplido |
| 12 | PR validado en CI; merge y tag solo con autorización | PR validado en CI. Merge y tag pendientes de autorización |
| 13 | Filtros de CI: cambios solo documentales no ejecutan CI; las rutas críticas siempre lo ejecutan; ejecución manual disponible | Cumplido (pruebas unitarias y eventos reales, sección 5.2) |
