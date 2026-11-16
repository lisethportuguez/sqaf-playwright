# ADR-0008: Jerarquía de errores, taxonomía de fallos y utilidades comunes

- **Estado:** Aceptado e implementado (aprobado por la responsable del TFG; PR [#6](https://github.com/lisethportuguez/sqaf-playwright/pull/6) fusionado en `main`, commit de merge `f4f79e7`, tag `v0.4.0`)
- **Fecha:** 2026-11-15
- **Etapa:** E5 (ciclo 1, ejecutada antes que E3 porque E3 usa sus errores)
- **Amplía:** [ADR-0006](ADR-0006-infrastructure-failure-classification.md) (E1 adelantó el subconjunto anti-bot)

## Contexto

Al cierre de E2, la capa de errores tenía `InfrastructureError` (solo con la clasificación `infrastructure/anti-bot-challenge`), el guard anti-bot y una clasificación posterior que solo distinguía `infrastructure/anti-bot-challenge` de `unclassified`. Las utilidades se reducían al detector anti-bot. E3 (datos y API) necesita errores contextualizados para datos inválidos y respuestas inesperadas de la API, y E7 necesita separar los fallos por causa.

## Decisiones

| # | Decisión | Justificación |
|---|---|---|
| D1 | **`SqafError` abstracta como base** de todo error lanzado por el framework: `classification`, `category` (derivada del prefijo), `summary`, `context` y `evidence` inmutables, y `cause` opcional | Un formato único (`[SQAF:<clasificación>] resumen`, líneas `Clave: valor`, líneas `Evidence:`) que el reporter reconoce sin heurísticas |
| D2 | **Subclases:** `InfrastructureError` (anti-bot, red, SUT no disponible), `DataValidationError` (`test-data/invalid`) y `ApiError` (`api/request-failed`) | Una clase por origen del fallo; el tipo de la clasificación queda restringido por el compilador |
| D3 | **Compatibilidad de E1:** `InfrastructureError` conserva nombre, propiedades (`category`, `classification`, `evidence`, `url`) y el formato exacto del mensaje. Una prueba compara el mensaje completo | El guard, sus pruebas y los mensajes ya observados en CI no cambian |
| D4 | **`ConfigurationError` permanece en `config/`** y se reexporta desde `src/errors/index.ts`. No hereda de `SqafError` | `config` es transversal y no puede importar ninguna capa (regla de dependencias). Además, falla antes de que exista cualquier test, así que nunca se clasifica |
| D5 | **Sin clases para automatización ni aserción.** `automation/locator-timeout` y `assertion/mismatch` se asignan después de la ejecución a los errores propios de Playwright | Envolverlos ocultaría el *call log* y el diff de Playwright. "Cuando corresponda": aquí no corresponde |
| D6 | **Taxonomía de 8 valores con prioridad fija:** anti-bot (regla de E1 sin cambios) → marcador SQAF → red → SUT no disponible → *timeout* de localizador → aserción → `unclassified` | Un solo valor por intento, determinista. La causa más externa gana: una aserción que falla porque el SUT devolvió un 502 se clasifica como infraestructura |
| D7 | **La clasificación es informativa** (como en ADR-0006): el reporter no cambia estados, retries ni el código de salida | Restricción del TFG y de ADR-0006 |
| D8 | **El reporter solo lee como texto de página los bloques ` ```yaml ` de `# Error details` y `# Page snapshot` del `error-context`**, nunca `# Test source` | El adjunto de Playwright 1.65 es un Markdown que también incluye el **código fuente del test**: un test con `"502: Bad gateway"` en su código se clasificó como `sut-unavailable` (defecto latente de E1). Cuando falla un `expect` sobre un localizador, Playwright escribe el snapshot de la página **dentro de `# Error details`** y no crea `# Page snapshot` (`playwright/lib/index.js`). La primera versión de D8 solo leía `# Page snapshot` y perdía la detección anti-bot por texto de página de E1; se corrigió en la revisión del ciclo 1 (ver "Revisión del ciclo 1") |
| D9 | **Redacción automática de secretos en `SqafError`:** (a) las claves con aspecto de secreto (`password`, `token`, `secret`, `credential`, `authorization`, `cookie`) se muestran como `[REDACTED]` **a cualquier profundidad** de objetos y arrays anidados; (b) todo texto (resumen, valores, evidencias, nota) pasa por `redactSecrets`: pares `password=…` de formularios, `"password": "…"` de JSON, cabeceras `Authorization`/`Cookie` y contraseñas generadas por SQAF (`Sqaf#` + 16 caracteres); (c) la **cadena de `cause`** se sustituye por copias saneadas (mismo nombre, mensaje y *stack* redactados, recursivo, con corte de ciclos), porque Playwright serializa `error.cause` en sus informes | Ningún mensaje de error puede filtrar una contraseña a la consola o a un informe. La redacción de `SqafError` **no** protege los artefactos nativos de Playwright (trazas, títulos de pasos, snapshots): de eso se ocupa ADR-0009 D16 |
| D10 | **Utilidades puras en `src/utils`:** `parsePrice`/`formatPrice`, `createIdSource`/`uniqueId`/`uniqueEmail`/`randomSecret`, `formatDuration`, `normalizeText` (movida desde el detector anti-bot y reexportada allí), `containsText`, `htmlTitle`/`htmlText` y *type guards* | Reutilizables por datos, API, páginas y reporting. `utils` no importa `errors`, así que una entrada inválida lanza `RangeError` y la capa superior añade el contexto |
| D12 | **La regla `sut-unavailable` ignora la expectativa del test**: en los mensajes solo cuenta lo que Playwright **recibió**; se descartan las líneas `Expected…:`, `Locator:` y el *call log* | Un test que espera el texto "502 Bad Gateway" en una página que responde 200 era un falso positivo de infraestructura (caso C5b) |
| D13 | **El extracto de error del informe de clasificación se redacta** (`redactExcerpt`), antes de recortarse a 400 caracteres: valores tecleados por `fill`/`type`/`pressSequentially`/`insertText` (*call log* y títulos de paso), contraseñas con prefijo `Sqaf#` de cualquier longitud y pares secretos de formularios, JSON y cabeceras. La clasificación se calcula con el texto original | El JSON de clasificación se publica en CI. Un `fill(password)` que falla con el campo ya localizado imprime el valor en el *call log* (incidente [INC-2026-11-16](../../security/INC-2026-11-16-baseline-report-credentials.md)). Redactar antes de recortar evita que quede un fragmento del valor |
| D14 | **Evidencia HTTP estructurada.** La fixture automática `httpEvidence` registra el código de la **última respuesta de documento del frame principal** (navegaciones; ignora recursos, XHR/fetch, iframes y llamadas de API) y, solo si el intento falla, la adjunta como `sqaf-http-evidence` (método, origen + ruta sin *query* ni fragmento, código y texto de estado). El reporter la lee y el clasificador aplica la regla 4a: **un documento con HTTP 5xx es `infrastructure/sut-unavailable`**, diga lo que diga la página. Prioridad: anti-bot → marcador SQAF → red → **4a (estado HTTP)** → 4b (texto 5xx) → *timeout* → aserción | En el run de CI `43799046248` el SUT respondió al POST de login con **HTTP 503** y una página "This website is under heavy load (queue full)" sin la frase estándar; las reglas de texto lo clasificaron `assertion/mismatch`. El código HTTP es la señal fiable. El contrato (`src/errors/http-evidence.ts`) lo comparten fixtures y reporter sin importarse entre sí. La línea base no usa las fixtures de SQAF, así que conserva solo las reglas de texto |
| D11 | **Identificadores reproducibles:** `<prefijo>-<runToken>-<secuencia>`. El `runToken` (tiempo + 4 bytes aleatorios) es la única fuente de aleatoriedad y se crea una vez por proceso. Con un *token* fijo, la secuencia es determinista | Unicidad entre ejecuciones y entre workers sin perder la reproducibilidad (ver ADR-0009) |

## Cambios de comportamiento respecto de E1

| Caso | E1 | E5 | Motivo |
|---|---|---|---|
| Fallo de automatización de E0 (TC9, `expect(locator).toBeVisible()`) | `unclassified` | `assertion/mismatch` | La taxonomía completa no existía. Sigue **sin** ser infraestructura, que era la garantía de E1 |
| Muestra `expect(2).toBe(3)` del test del reporter | `unclassified` | `assertion/mismatch` | Ídem |
| Informe `failure-classification.json` | `schemaVersion: 1`, 2 contadores | `schemaVersion: 2`, 8 contadores | Esquema estable: siempre todas las clasificaciones |
| Consola y resumen del job | Todos los contadores | Solo los contadores mayores que 0 | Con 8 valores, los ceros añadían ruido |
| `error-context` completo como texto de página | Sí | Solo los bloques `yaml` de `# Error details` y `# Page snapshot` (nunca `# Test source`) | D8 |

Todas las pruebas negativas anti-bot de E1 (títulos parciales, fragmentos, comillas, mensaje vacío) se conservan sin cambios y pasan.

## Revisión del ciclo 1 (2026-11-15)

La revisión complementaria ejecutó fallos reales de Playwright 1.65 contra un servidor local (sin SUT) y encontró dos defectos, ya corregidos:

- **Regresión frente a E1 (D8):** una aserción de localizador sobre la página del desafío se clasificaba `assertion/mismatch`; con E1 (`v0.3.0`) era `anti-bot`.
- **Falso positivo (D12):** una expectativa con el texto "502 Bad Gateway" se clasificaba `sut-unavailable`.

Casos verificados de extremo a extremo con el reporter real (`docs/validation/E5-utilities-error-handling.md` §3.6):

| Caso | Clasificación |
|---|---|
| C1. Aserción fallida en una página 502 de Cloudflare | `infrastructure/sut-unavailable` (D6) |
| C1b. Respuesta 502 sin la frase estándar en la página | `assertion/mismatch` (no hay texto que lo pruebe) |
| C1c. *Timeout* de acción en una página 502 | `automation/locator-timeout` (limitación: el adjunto no incluye snapshot) |
| C2. *Timeout* de localizador | `automation/locator-timeout` |
| C3a / C3b. Error DNS en el navegador / en la API | `infrastructure/network` |
| C4 / C4b. Desafío anti-bot (título / aserción de localizador) | `infrastructure/anti-bot-challenge` |
| C5. Aserción con "Rs. 502" y HTTP 200 | `assertion/mismatch` |
| C5b. Expectativa "502 Bad Gateway" y HTTP 200 | `assertion/mismatch` |
| C6. POST de login respondido con HTTP 503 "queue full" (CI `43799046248`), con la evidencia de D14 | `infrastructure/sut-unavailable` |
| C6b. Página sana (200) con una imagen y un iframe que responden 503 | `assertion/mismatch` (solo cuenta el documento principal) |

## Alternativas descartadas

- **Envolver los errores de Playwright** en `AutomationError` o `AssertionError`: se pierde la información nativa (D5).
- **Mover `ConfigurationError` a `src/errors`**: rompería la regla de dependencias (`config` no importa capas).
- **Clasificar con varias etiquetas por intento**: complica el análisis de E7 sin beneficio claro.

## Consecuencias

- Toda clasificación nueva se añade en `classifications.ts`. Los contadores del informe y los tipos se actualizan solos.
- La regla `assertion/mismatch` no distingue un defecto del producto de un defecto de la automatización: el texto no lo permite. Esa distinción queda para el análisis manual de E7.
- Las reglas de red y de 5xx se validaron con mensajes reproducidos y con un fallo real de DNS local (`getaddrinfo ENOENT`, E3). No se han observado todavía en CI.
