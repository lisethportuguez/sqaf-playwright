# ADR-0008: Jerarquía de errores, taxonomía de fallos y utilidades comunes

- **Estado:** Propuesto (implementado en la rama `stage/3-5-data-utils-errors`; pendiente de revisión por la responsable del TFG)
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
| D8 | **El reporter solo lee la sección `# Page snapshot` del `error-context`** | El adjunto de Playwright 1.65 es un Markdown que también incluye el **código fuente del test**. Se detectó un falso positivo real: un test con `"502: Bad gateway"` en su código se clasificó como `sut-unavailable`. Era un defecto latente de E1, que también afectaba a la regla anti-bot |
| D9 | **Contexto con redacción automática:** las claves con aspecto de secreto (`password`, `token`, `secret`, `credential`, `authorization`, `cookie`) se muestran como `[REDACTED]` | Ningún mensaje de error puede filtrar una contraseña a la consola o a un informe |
| D10 | **Utilidades puras en `src/utils`:** `parsePrice`/`formatPrice`, `createIdSource`/`uniqueId`/`uniqueEmail`/`randomSecret`, `formatDuration`, `normalizeText` (movida desde el detector anti-bot y reexportada allí), `containsText`, `htmlTitle`/`htmlText` y *type guards* | Reutilizables por datos, API, páginas y reporting. `utils` no importa `errors`, así que una entrada inválida lanza `RangeError` y la capa superior añade el contexto |
| D11 | **Identificadores reproducibles:** `<prefijo>-<runToken>-<secuencia>`. El `runToken` (tiempo + 4 bytes aleatorios) es la única fuente de aleatoriedad y se crea una vez por proceso. Con un *token* fijo, la secuencia es determinista | Unicidad entre ejecuciones y entre workers sin perder la reproducibilidad (ver ADR-0009) |

## Cambios de comportamiento respecto de E1

| Caso | E1 | E5 | Motivo |
|---|---|---|---|
| Fallo de automatización de E0 (TC9, `expect(locator).toBeVisible()`) | `unclassified` | `assertion/mismatch` | La taxonomía completa no existía. Sigue **sin** ser infraestructura, que era la garantía de E1 |
| Muestra `expect(2).toBe(3)` del test del reporter | `unclassified` | `assertion/mismatch` | Ídem |
| Informe `failure-classification.json` | `schemaVersion: 1`, 2 contadores | `schemaVersion: 2`, 8 contadores | Esquema estable: siempre todas las clasificaciones |
| Consola y resumen del job | Todos los contadores | Solo los contadores mayores que 0 | Con 8 valores, los ceros añadían ruido |
| `error-context` completo como texto de página | Sí | Solo `# Page snapshot` | D8 |

Todas las pruebas negativas anti-bot de E1 (títulos parciales, fragmentos, comillas, mensaje vacío) se conservan sin cambios y pasan.

## Alternativas descartadas

- **Envolver los errores de Playwright** en `AutomationError` o `AssertionError`: se pierde la información nativa (D5).
- **Mover `ConfigurationError` a `src/errors`**: rompería la regla de dependencias (`config` no importa capas).
- **Clasificar con varias etiquetas por intento**: complica el análisis de E7 sin beneficio claro.

## Consecuencias

- Toda clasificación nueva se añade en `classifications.ts`. Los contadores del informe y los tipos se actualizan solos.
- La regla `assertion/mismatch` no distingue un defecto del producto de un defecto de la automatización: el texto no lo permite. Esa distinción queda para el análisis manual de E7.
- Las reglas de red y de 5xx se validaron con mensajes reproducidos y con un fallo real de DNS local (`getaddrinfo ENOENT`, E3). No se han observado todavía en CI.
