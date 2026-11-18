# Etapa 6 — Cierre de la integración de Allure Report

> Datos reales, sin editar. Decisiones, política de datos sensibles y detalle técnico: [ADR-0011](../architecture/decisions/ADR-0011-allure-report.md). Cambios del workflow: [ADR-0003](../architecture/decisions/ADR-0003-ci-github-actions.md#cambios-de-la-etapa-6-informe-allure). Uso local y consulta de artefactos: [guía de usuario](../user-guide.md).

- **Estado:** **cerrada.** PR [#10](https://github.com/lisethportuguez/sqaf-playwright/pull/10) (`stage/6-allure-report`) fusionado en `main` el 2026-11-18 con el merge commit `72ea7f4df8755b81a23720a21a6acc3ca71bfd33`. Validada en el CI de `main`, run [44215539394](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/44215539394), intento 2. Sin tag ni release.
- **Alcance de esta etapa:** solo el informe Allure. El reporter de métricas (`MetricsReporter`) y los demás formatos de la Etapa 6 siguen planificados.

## 1. Objetivo

Incorporar un informe gráfico de los resultados de SQAF que muestre resultados por suite, módulo y escenario, pasos, duraciones, categorías de fallo y tendencias entre ejecuciones. Debía publicarse en GitHub Actions sin exponer datos sensibles en un repositorio público y sin alterar la línea base E0 ni los registros oficiales de SQAF.

## 2. Alcance implementado

| Funcionalidad | Cómo se obtiene |
|---|---|
| Informe gráfico | Allure 3 (`allure@3.22.1`) y `allure-playwright@3.14.0`, versiones exactas (ADR-0011 D1) |
| Organización por módulo y escenario | `E2E (chromium)` → Authentication / Products / Checkout → `TCn: …`; `Integration` → área → archivo (D9) |
| Pasos y duración | Los `test.step` de los escenarios, sin los pasos internos de Playwright (`detail: false`) |
| Clasificación SQAF | Etiqueta `sqaf.classification` leída de `reports/failure-classification.json` y categorías en `allurerc.mjs` (D2, D10) |
| Enlaces a casos oficiales y a la línea base | `sqaf-test-case` como enlace «Official TCn»; `sqaf-baseline-pair` como etiqueta `baselinePair` (D5) |
| Informe de un solo archivo | `allure-report/awesome/index.html` (informe) y `allure-report/dashboard/index.html` (tendencias) |
| Historial y tendencias | `allure-history/history.jsonl`, una entrada por ejecución completa (D11) |
| GitHub Actions | Reporter añadido a Integration y E2E; publicación del informe y del historial como artefactos independientes (D12) |

**Allure es una capa de presentación.** No sustituye a la clasificación de fallos (`reports/failure-classification.json`) ni al resumen seguro (`reports/run-summary.json`), que siguen siendo los registros oficiales. Allure solo lee la clasificación y nunca cambia estados, reintentos ni el código de salida.

## 3. Cambios principales

Commits del PR #10 (identidad noreply):

| Commit | Contenido |
|---|---|
| `b01c969` feat(reporting) | Cadena segura del reporter: saneamiento, escaneo *fail-closed*, generación, estado `reports/allure-status.json`, scripts `test:allure`, `test:e2e:allure`, `test:integration:allure` y `report:allure` |
| `55c1c4e` ci | Integración en el workflow y contratos de CI |
| `8568fee` docs | ADR-0011, ADR-0003, `architecture.md`, `README.md` y `docs/user-guide.md` |
| `0d76b08` test(reporting) | Títulos de las pruebas del escáner sin valores de muestra (se imprimen en el log público del CI) |
| `e9b859c` fix(reporting) | Corrección del falso positivo de tarjeta dentro de identificadores hexadecimales (§4.2) |

Sin cambios en escenarios, Page Objects, fixtures, `playwright.config.ts`, la línea base E0 ni en las versiones de las dependencias existentes. Allure no es un reporter configurado: se añade por la línea de comandos (ADR-0011 D3).

## 4. Evidencia de validación

### 4.1 Local contra el SUT (2026-11-17)

Chromium, 1 worker, Automation Exercise:

| Ejecución | Resultado | Allure |
|---|---|---|
| Integration | 40/40 | Informe sin entrada de historial (solo Integration) |
| E2E completa | 18/18 | Informe combinado de 58 resultados y 1 entrada de historial |

- Suite unitaria: 393 pruebas; typecheck sin errores.
- `npm run report:allure` sirvió el informe en `127.0.0.1`, con respuesta 200 en la portada, el informe y el panel.
- Sin bloqueos de Cloudflare.

### 4.2 CI del PR #10

| Run | Commit | Resultado |
|---|---|---|
| [44029175235](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/44029175235) | `8568fee` | Correcto; informe publicado y escaneado con 0 hallazgos |
| [44029915954](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/44029915954) | `0d76b08` | **Bloqueado por el pipeline (*fail-closed*)**: las pruebas pasaron, pero no se publicó el informe y el run falló en «Check Allure pipeline». Causa: un id de resultado hexadecimal de 32 caracteres contenía por azar 16 dígitos que pasan Luhn (falso positivo de `card-number`). Corregido en `e9b859c` con prueba de regresión |
| [44030723851](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/44030723851) | `e9b859c` | Correcto: unitarias 394, línea base 5, Integration 40, E2E `@smoke` 9. Informe publicado y escaneado con 0 hallazgos; «Upload Allure history» omitido (PR) |

### 4.3 CI de `main` tras la fusión (run 44215539394)

**Intento 1 (2026-11-18, 01:28 UTC): fallido por infraestructura.** Las 5 pruebas de la línea base recibieron la página de verificación de Cloudflare («One moment, please...») en la primera carga y se clasificaron como `infrastructure/anti-bot-challenge` (5/5). No hubo fallos de aserción, localizadores ni datos. El workflow detuvo el job tras la línea base, así que Integration, E2E y los pasos de Allure no se ejecutaron. **No es un fallo funcional del framework ni de Allure.** Solo se publicaron `baseline-classification` y `failure-evidence`, sin datos sensibles.

**Intento 2 (relanzamiento autorizado): correcto.**

| Validación | Resultado |
|---|---:|
| Typecheck | Correcto |
| Pruebas unitarias | 394/394 |
| Línea base E0 | 5/5 |
| Integration | 40/40 |
| E2E (suite completa) | 18/18 |
| Resultados Allure | 58/58 superados |
| Revisión de seguridad | 0 hallazgos |
| Pruebas inestables | 0 |
| Reintentos en el segundo intento | 0 |

Pasos de Allure: «Download Allure history (read-only)», «Upload Allure report», «Upload Allure history» y «Check Allure pipeline» terminaron correctamente. Estado final del pipeline: `"status": "generated"`, `"safe": true`, `"historyAppended": true`, `"findings": []`.

Artefactos del intento 2:

| Artefacto | Tamaño | Retención |
|---|---:|---|
| `allure-report-44215539394-2` | 4 537 358 bytes | 14 días |
| `allure-history-44215539394-2` | 9 467 bytes | 90 días |
| `integration-summary-44215539394-2`, `e2e-summary-44215539394-2`, `baseline-classification-44215539394-2` | < 3 KB cada uno | 14 días |

## 5. Seguridad y protección de información

Revisión de los artefactos descargados del intento 2 y de su log:

- Informe, historial y resúmenes escaneados con el escáner del repositorio (`scan-report.ts`): **0 hallazgos**.
- **139 entradas** del informe decodificadas (datos base64 del informe de un solo archivo) durante la revisión.
- Log del intento 2: 0 correos, 0 contraseñas `Sqaf#`, 0 `dataId` y 0 direcciones de cuenta `sqaf.user`.
- No se publicó `allure-results` ni `allure-results-safe`; el log no menciona `allure-results`.
- El saneamiento descartó 2 adjuntos en Integration y 8 en E2E (registros de limpieza de cuentas) y no conservó ninguna captura.
- El historial solo se publica en *push* a `main`; los PR lo leen pero no lo escriben.
- Retención: 14 días el informe y 90 días el historial.

Política completa de datos sensibles y capturas: [ADR-0011](../architecture/decisions/ADR-0011-allure-report.md#política-de-capturas-y-datos-sensibles).

## 6. Historial y tendencias

Primera publicación del historial en `main`:

- Artefacto: `allure-history-44215539394-2`.
- 1 entrada histórica con 58 resultados registrados.
- Los 58 tests aparecen como nuevos, porque no había historial previo.
- Los gráficos de tendencia del panel tienen **un solo punto**.

Todavía **no existe una tendencia histórica**: es la primera entrada. Cada *push* posterior a `main` descargará el último historial publicado y añadirá un punto.

## 7. Relación con el Capítulo IV del TFG

E6 aporta evidencia cualitativa de capacidades, no mediciones de mejora. No se midió ningún indicador que compare el esfuerzo de análisis con y sin Allure.

| Aspecto | Contribución observable | Evidencia |
|---|---|---|
| Visualización de resultados | Resultados agrupados por suite, módulo y escenario en un único archivo HTML | §2; informe del run 44215539394 |
| Seguimiento de ejecuciones | Cada informe enlaza su commit y su run de CI; pasos y duración por escenario | `summary.json` del informe (`commitSha`, `ciRunHref`) |
| Tendencias históricas | Historial persistente en `main`, con una entrada por ejecución completa | §6 (por ahora, 1 punto) |
| Trazabilidad | Enlace al caso oficial y al par de la línea base en cada escenario | ADR-0011 D5 |
| Complemento a la clasificación y las evidencias | Las categorías SQAF se muestran en el informe sin recalcularlas; los registros oficiales no cambian | ADR-0011 D2 y D10; §4.3 (el bloqueo de Cloudflare quedó clasificado como infraestructura) |
| Seguridad del reporting | El bloqueo *fail-closed* del run 44029915954 demostró en CI que un hallazgo impide la publicación | §4.2 |

## 8. Limitaciones

- Las capturas son imágenes y el escáner no las inspecciona; su única protección es la lista de suites permitidas.
- La detección depende de patrones conocidos: un dato sensible con un formato nuevo necesita un detector nuevo.
- Actualizar Allure exige revisar las huellas SHA-256 fijadas (`KNOWN_STATIC_RESOURCES`, `KNOWN_STATIC_EMAIL_HASHES`) y los mecanismos de seguridad; hasta entonces el escaneo falla.
- El historial depende de artefactos de 90 días: si pasan más de 90 días sin un *push* a `main`, las tendencias empiezan de cero.
- Cloudflare bloquea de forma intermitente la línea base en los runners de GitHub (intento 1 de este run); cuando ocurre, no se genera informe Allure en ese intento.
- Resto de riesgos residuales: [ADR-0011, Consecuencias](../architecture/decisions/ADR-0011-allure-report.md#consecuencias).

## 9. Estado final

| Elemento | Estado |
|---|---|
| PR #10 | Fusionado (merge commit `72ea7f4`) |
| CI de `main` | Run 44215539394, intento 2 correcto |
| Informe Allure en CI | Publicado y escaneado sin hallazgos |
| Historial en `main` | Publicado por primera vez (1 entrada) |
| Línea base E0 | Sin cambios |
| Tag o release de E6 | No creados |
| Pendiente en la Etapa 6 | `MetricsReporter` y demás formatos (planificados) |
