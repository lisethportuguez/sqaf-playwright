# ADR-0011: Allure Report como vista segura de los resultados (reporting)

- **Estado:** Aceptado. Implementado en cuatro fases, cada una autorizada por la responsable del TFG:
  - **Fase 1** (2026-11-16): prototipo local con `tests/e2e/products`.
  - **Fase 2** (2026-11-16): integración en el repositorio, validada con muestras sintéticas.
  - **Fases 3 y 4** (2026-11-17): GitHub Actions y documentación, en la rama `stage/6-allure-report` y su PR. Validadas en local contra el SUT y en el CI del PR.
  - **Cierre** (2026-11-18): PR #10 fusionado en `main` (merge commit `72ea7f4`) y validado en el CI de `main` (run 44215539394, intento 2), con la primera publicación del historial. Registro: [E6-allure-report.md](../../validation/E6-allure-report.md).
- **Fecha:** 2026-11-17
- **Etapa:** E6 (reporting y métricas)
- **Relacionado:**
  - [ADR-0003](ADR-0003-ci-github-actions.md): CI y publicación de artefactos.
  - [ADR-0006](ADR-0006-infrastructure-failure-classification.md) y [ADR-0008](ADR-0008-error-handling-utilities.md): clasificación de fallos.
  - [ADR-0009](ADR-0009-test-data-management.md) D16: evidencias de credenciales.
  - [ADR-0010](ADR-0010-functional-scenarios.md) D4 y D12: anotaciones; nada de lo publicado identifica una cuenta.
  - [INC-2026-11-16](../../security/INC-2026-11-16-baseline-report-credentials.md).
  - Guía de uso: [docs/user-guide.md](../../user-guide.md).

## Contexto

SQAF tiene dos registros oficiales de cada ejecución:
- `reports/failure-classification.json`: la clasificación de cada intento fallido.
- `reports/run-summary.json`: el resumen seguro.

Faltaba un informe visual con:
- resultados por suite, módulo y escenario;
- pasos y duraciones;
- categorías de error;
- evidencias permitidas;
- tendencias entre ejecuciones.

Allure Report aporta esa vista. El prototipo de la Fase 1 mostró que **no es seguro con su configuración por defecto** en un repositorio público:

| Hallazgo (Allure 3.22.1 + allure-playwright 3.14.0) | Consecuencia |
|---|---|
| `detail: true` (valor por defecto) guarda unos 50 pasos internos por test, con los valores tecleados (`Fill "Jeans"`) | En Authentication y Checkout serían e-mails y contraseñas |
| Las anotaciones que Allure no conoce se convierten en pasos (`sqaf-test-case: …`) | `sqaf-test-data`, que lleva el `dataId`, aparecería como paso |
| Etiquetas `host` y `thread`; `suite` con rutas de Windows | Nombre del equipo en el informe |
| El informe de un solo archivo guarda los datos en base64 (`d("<ruta>","<base64>")`) | Una búsqueda de texto no detecta fugas |
| El *bundle* de Allure contiene direcciones de autores de librerías y tokens minificados con forma de e-mail o de tarjeta | Falsos positivos de un escáner ingenuo |
| `allure open` escucha en todas las interfaces de red | El informe sería accesible desde la red local |

## Decisiones

| # | Decisión | Justificación |
|---|---|---|
| D1 | **Herramientas:** Allure 3 (`allure@3.22.1`, sobre Node, sin Java) y `allure-playwright@3.14.0`, con versión **exacta**, como dependencias de desarrollo. `allure-playwright` reutiliza el `@playwright/test` 1.65.0 del proyecto: no hay una segunda copia en `package-lock.json` | Allure 2 necesita Java en local y en CI. Las versiones elegidas tienen más de dos semanas y son compatibles con Playwright ≥ 1.62 y Node ≥ 22.18 |
| D2 | **Allure es una vista, no un registro oficial.** La clasificación SQAF se **lee** de `failure-classification.json` y nunca se recalcula ni se modifica. Se añade como etiqueta `sqaf.classification` a cada intento fallido. El emparejamiento (proyecto, archivo, título y reintento) es el mismo que usa el resumen seguro. Un intento sin entrada en el JSON recibe `not classified` | No duplicar el clasificador. El JSON, el resumen y el informe muestran los mismos datos |
| D3 | **No es un reporter configurado:** se añade por la línea de comandos, **después** del reporter de clasificación. `playwright.config.ts`, la línea base y los scripts existentes no cambian | La línea base conserva sus condiciones de E0 y su contrato. Playwright ejecuta `onEnd` en el orden de los reporters, así que la clasificación ya está escrita cuando Allure la lee |
| D4 | **Cadena segura y *fail-closed*** dentro del reporter (`src/reporting/allure-reporter.ts`), ver detalle bajo la tabla | Lo crudo nunca llega al informe. Si falla cualquier regla, el resultado es un bloqueo, nunca una publicación |
| D5 | **Saneamiento con listas de permitidos** (`src/reporting/allure/prepare-results.ts`), ver detalle bajo la tabla | Lo que no está permitido explícitamente no pasa |
| D6 | **Política de capturas:** ver la sección [Política de capturas y datos sensibles](#política-de-capturas-y-datos-sensibles) | Las capturas no se pueden escanear como texto |
| D7 | **Escáner** (`src/reporting/allure/scan-report.ts`), ver detalle bajo la tabla | Un *fail-closed* real sobre lo que verá un lector |
| D8 | **Exclusión controlada de recursos estáticos**, con solo dos reglas (detalle bajo la tabla). Cualquier otra versión de Allure hace fallar el escaneo hasta que se revise | Evitar falsos positivos sin abrir una vía de fuga: los datos nunca se excluyen |
| D9 | **Agrupación** suite → módulo → escenario, con `parentSuite`/`suite`/`subSuite` y también `feature`/`story`: `E2E (chromium)` → `Authentication` / `Products` / `Checkout` → `TCn: …`, e `Integration` → área (`Data`, `Fixtures`, `Pages`, `Reporting`, `Security`) → archivo. Los casos dirigidos por datos comparten escenario y llevan el parámetro `Case` | Son las vistas que pide el TFG, sin cambiar las suites |
| D10 | **Categorías** (`allurerc.mjs`): una por categoría de la taxonomía SQAF (infraestructura, datos, API, automatización, aserciones y sin clasificar), agrupadas por la clasificación exacta. Una prueba comprueba que cada valor de `FAILURE_CLASSIFICATIONS` cae en exactamente una. Un bloqueo de Cloudflare aparece como `infrastructure/anti-bot-challenge`, no como fallo del informe | La taxonomía de ADR-0008 sigue siendo la única |
| D11 | **Una entrada de historial por ejecución completa**, en `allure-history/history.jsonl` (`historyPath`, `appendHistory`), ver detalle bajo la tabla | Evita la entrada duplicada que producía la Fase 2 cuando Integration y E2E se ejecutaban por separado |
| D12 | **CI (Fase 3):** los cambios del workflow se detallan bajo la tabla | Mínimo privilegio, sin publicación pública, y la línea base E0 intacta |

**D4. Cadena del reporter:**
1. `allure-playwright` escribe los resultados crudos de esta ejecución en `allure-results/`, con `detail: false`. La carpeta se vacía al empezar.
2. `prepareAllureResults` escribe la copia saneada en un directorio de preparación, la escanea y solo entonces la mueve a `allure-results-safe/`. Cada proyecto lleva su prefijo.
3. `allure generate` lee **solo** `allure-results-safe/`.
4. El informe y el historial se escanean. Si hay un hallazgo, se borra el informe y se restaura el historial anterior.
5. Se escribe `reports/allure-status.json`, que contiene detectores y nombres de archivo, nunca valores. En CI se añade además una línea al resumen del job.

El reporter nunca cambia estados, reintentos ni el código de salida.

**D5. Saneamiento:**
- **Textos:** nombres, pasos, mensajes, trazas, parámetros, etiquetas, enlaces y descripciones pasan por `redactSecrets(redactTypedValues(…))` y además por la redacción de `dataId`, rutas locales y nombre del equipo.
- **Anotaciones:** `sqaf-test-case` se convierte en un enlace TMS y `sqaf-baseline-pair` en la etiqueta `baselinePair`. El resto se descarta, incluida `sqaf-test-data`.
- **Etiquetas:** solo `language`, `framework`, `tag`, `severity`, `owner`, `epic` y `_fallbackTestCaseId`.
- **Enlaces:** solo `http(s)`.
- **Archivos crudos:** no se copian los contenedores, `executor.json` ni `categories.json`.

**D7. Detectores del escáner:**
- e-mails, contraseñas generadas y pares de contraseña en formato máquina;
- tarjetas (Luhn), `dataId` y direcciones de cuenta;
- valores tecleados y la anotación `sqaf-test-data`;
- nombre del equipo y rutas de usuario.

Además:
- **Decodifica** las entradas `d("…","base64")` y las URI `data:…;base64,`.
- Un tipo de archivo que no se puede leer como texto es un hallazgo, salvo las imágenes y las fuentes.
- Usa patrones acotados: un informe de varios MB se escanea en menos de un segundo.
- Los hallazgos nombran el detector, el archivo y la entrada, **nunca el valor**.

**D8. Las dos reglas de exclusión:**
1. El *bundle* JavaScript de la portada se omite **solo si su SHA-256 coincide** con el fijado en `KNOWN_STATIC_RESOURCES` (Allure 3.22.1).
2. Las direcciones **exactas** de las cabeceras de licencia se ignoran **solo** fuera de los datos incrustados. Se guardan únicamente como SHA-256 en `KNOWN_STATIC_EMAIL_HASHES`, porque son de personas reales y el repositorio es público.

**D11. Historial:**
- Una ejecución **solo de Integration** genera el informe con las tendencias existentes, pero **no añade** entrada.
- La ejecución que incluye los escenarios E2E añade la entrada de toda la ejecución, con los resultados de Integration preparados antes.
- `npm run test:allure` ejecuta las dos suites en una sola invocación.
- El panel `dashboard` muestra las tendencias.
- Todo lo generado está en `.gitignore`.

**D12. Cambios en el workflow:**
- **Permisos:** `contents: read` y `actions: read`. Este último solo sirve para leer artefactos de ejecuciones anteriores. No se usa GitHub Pages.
- **Descarga del historial:** de solo lectura, desde el último *push* completado en `main` que lo publicó. Se hace después de la línea base y antes de Integration.
- **Reporter:** los pasos de Integration y E2E añaden el reporter Allure al final de su lista.
- **Publicación:** solo `allure-report/`, como artefacto `allure-report-<run>-<intento>` de 14 días, y solo si el informe existe (si hubo un hallazgo, se borró).
- **Historial publicado:** `allure-history-<run>-<intento>`, 90 días, **solo** en *push* a `main`. Los PR y las ejecuciones manuales lo leen pero no lo publican.
- **Comprobación final:** «Check Allure pipeline» hace fallar el run si el estado no es seguro.
- **Nunca se publican** `allure-results/` ni `allure-results-safe/`.

## Política de capturas y datos sensibles

| Dato | En el informe Allure |
|---|---|
| E-mails (de cuentas o cualquier otro) | Nunca: `[e-mail redacted]` |
| Contraseñas generadas (`Sqaf#…`) y pares `password=…` / `"password": "…"` | Nunca: `[REDACTED]` |
| Números de tarjeta (Luhn) | Nunca: `[card redacted]` |
| `dataId` de cuentas y anotación `sqaf-test-data` | Nunca: `[data id redacted]`; la anotación se descarta |
| Valores tecleados (`Fill "…"`, `fill("…")`) | Nunca: los pasos internos no se registran (`detail: false`) y los demás se redactan |
| Rutas locales y nombre del equipo | Nunca: `<root>`, `~`, `[user]`, `[host redacted]` |
| Trazas, vídeos, `error-context`, `stdout`/`stderr`, `sqaf-account-cleanup`, `sqaf-http-evidence` | Nunca: se descartan siempre, junto con el paso que solo los envolvía |
| **Capturas de fallo** | **Solo** de las suites de `SQAF_ALLURE.screenshotSuites` (`config/allure.ts`) |

**Suites con capturas permitidas:**
- `tests/e2e/products/`;
- de Integration: `pages/base-page`, `pages/cart`, `pages/products`, `pages/product-components`, `fixtures/anti-bot` y `fixtures/fixtures`.

Es **la misma lista** de evidencias de fallo que ya publica el CI. Lo comprueba `tests/unit/reporting/allure-config.spec.ts` contra `ci.yml`.

Authentication, Checkout y las suites de Integration con cuentas, e-mails, contraseñas o tarjetas no adjuntan nunca capturas, porque muestran formularios.

**Mantenimiento:** añadir una suite a la lista exige:
- que esa suite no use cuentas, e-mails, contraseñas ni tarjetas;
- añadirla también a las evidencias de fallo del CI, o la prueba de coincidencia falla;
- la autorización de la responsable del TFG.

**Limitación:** las capturas son imágenes y el escáner no puede leer su contenido. Su única protección es esta lista de suites.

## Comandos

```powershell
npm run test:allure              # Integration + E2E en una invocación: un informe y una entrada de historial (contra el SUT)
npm run test:e2e:allure          # solo E2E; combina los resultados de Integration preparados antes
npm run test:integration:allure  # solo Integration; no añade entrada de historial
npm run report:allure            # sirve allure-report/ en http://127.0.0.1:<puerto>
```

El informe también se abre con doble clic en `allure-report/awesome/index.html`, que es un solo archivo. La portada `allure-report/index.html` enlaza el informe y el panel de tendencias.

## Validación

**Fase 2 (local, sin SUT):**
- 382 pruebas unitarias.
- Ejecución de extremo a extremo con el `allure-playwright` y el `allure generate` reales sobre muestras sintéticas.
- Bloqueo *fail-closed* del resultado y del informe.

**Fases 3 y 4, en local contra Automation Exercise (Chromium, 1 worker, 2026-11-17):**
- **Ejecuciones:** Integration 40/40 (informe sin entrada de historial) y E2E 18/18 (informe combinado con 58 resultados y **1** entrada de historial). 0 intentos fallidos.
- **Adjuntos:** se descartaron 8 registros de limpieza de cuentas en E2E y 2 en Integration.
- **Escaneo independiente:** 0 hallazgos en el informe, el historial y los resultados seguros. El control sobre los resultados crudos sí encuentra `dataId` y el nombre del equipo.
- **Apertura:** `npm run report:allure` sirve en `127.0.0.1`, con respuesta 200 en la portada, el informe y el panel.

**Pruebas añadidas o actualizadas:**
- `tests/unit/ci/workflow-allure.spec.ts` (nueva): contratos del workflow.
- Contratos de CI existentes, actualizados a los nuevos pasos.
- `tests/integration/security/integration-artifacts.spec.ts`: el paso de integración del CI, ejecutado contra un SUT falso, genera ahora el informe Allure. Su contenido decodificado se escanea con los valores reales de las cuentas creadas.
- Suite unitaria completa: 393 pruebas.

**CI del PR (#10):**
- **Run 44029175235:** correcto. Informe publicado y escaneado en local tras la descarga, con 0 hallazgos. El historial no se publicó (PR).
- **Run 44029915954:** el pipeline **bloqueó** el informe y el run falló en «Check Allure pipeline», sin publicar ningún informe. Todas las pruebas habían pasado.
  - **Causa:** un falso positivo de `card-number`. El id de un resultado de Allure (hash hexadecimal de 32 caracteres) contenía por azar 16 dígitos seguidos que pasan Luhn.
  - **Corrección:** el detector ignora un candidato solo si todo el token alfanumérico es un identificador hexadecimal de 32 caracteres o más. Lo cubre una prueba de regresión con ese id.
  - **Interpretación:** es la prueba en CI de que el *fail-closed* detiene la publicación.
- **Run 44030723851 (final, `e9b859c`):** correcto. Unitarias 394, línea base 5, Integration 40, E2E `@smoke` 9; informe publicado y escaneado con 0 hallazgos.

**CI de `main` tras la fusión (run 44215539394):**
- **Intento 1:** la línea base falló 5/5 por el desafío anti-bot de Cloudflare (`infrastructure/anti-bot-challenge`), un problema de infraestructura. Allure no llegó a ejecutarse.
- **Intento 2:** correcto. Unitarias 394, línea base 5, Integration 40, E2E completa 18; 58/58 resultados en Allure, 0 inestables y 0 reintentos. Se publicaron el informe y el primer historial (`allure-history-44215539394-2`, 1 entrada), ambos escaneados con 0 hallazgos.
- Detalle y evidencia: [E6-allure-report.md](../../validation/E6-allure-report.md).

## Consecuencias

**Positivas:**
- Hay un informe visual con resultados por suite, módulo y escenario, pasos, duración, categorías SQAF, capturas permitidas y tendencias.
- En CI se publica como artefacto descargable.
- No cambian las suites, la línea base, la clasificación ni el resumen seguro.

**Riesgos residuales:**
- **Capturas:** no se pueden escanear como texto (ver la política).
- **Resultados crudos:** `allure-results/` contiene valores tecleados, igual que `playwright-report/`. Se quedan en local o en el runner, no se versionan y nunca se publican ni se usan para generar el informe.
- **Escáner basado en patrones:** un dato sensible con un formato nuevo necesita un detector nuevo.
- **Actualizar Allure:** exige revisar `KNOWN_STATIC_RESOURCES` y `KNOWN_STATIC_EMAIL_HASHES`. Hasta hacerlo, el escaneo falla.
- **Sin comando de escaneo independiente:** el escáner se ejecuta dentro del reporter, con el cargador TypeScript de Playwright. Node 26 no ejecuta TypeScript con sintaxis ESM en un paquete `"type": "commonjs"` sin un cargador adicional. En CI basta con el estado que escribe el reporter.
- **Historial en CI:** depende de los artefactos de 90 días. Si pasan más de 90 días sin un *push* a `main`, las tendencias empiezan de cero. Si una ejecución de `main` se bloquea por un hallazgo, no publica historial y la siguiente parte del último historial seguro.
- **Ejecuciones separadas en local:** `npm run test:e2e:allure` combina los resultados de Integration preparados en una ejecución anterior, aunque sean antiguos. `npm run test:allure` lo evita.
