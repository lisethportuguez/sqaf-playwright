# Validación E5: utilidades comunes y manejo de errores

- **Etapa:** E5 (ciclo 1, junto con E3). Se ejecutó **antes** que E3 porque E3 usa sus errores.
- **Rama:** `stage/3-5-data-utils-errors` (creada desde `main` en `403115f`, merge de E2, tag `v0.3.0`)
- **Fecha:** 2026-11-15
- **Decisiones:** [ADR-0008](../architecture/decisions/ADR-0008-error-handling-utilities.md) (propuesto, pendiente de revisión)
- **Estado:** implementado y validado en local. **No cerrado**: falta la revisión de la responsable del TFG y la ejecución en CI.

## 1. Auditoría previa

| Componente | Estado al inicio | Acción en E5 |
|---|---|---|
| `src/errors/infrastructure-error.ts` | `InfrastructureError` con una sola clasificación | Hereda de `SqafError`; acepta `network` y `sut-unavailable`; mismo mensaje |
| `src/errors/anti-bot-guard.ts` | Guard de navegación | Sin cambios |
| `src/errors/failure-classification.ts` | 2 valores (`anti-bot`, `unclassified`) | Taxonomía de 8 valores con prioridad; la regla anti-bot se mantiene intacta y es la primera |
| `src/utils/anti-bot-detector.ts` | Detector, `normalizeText`, `stripAnsi` | `normalizeText` y `stripAnsi` se mueven a `text.ts` y se reexportan (sin duplicar) |
| `src/reporting/failure-classification-reporter.ts` | 2 contadores, lee el `error-context` completo | 8 contadores (`schemaVersion: 2`), solo lee `# Page snapshot` |
| `config/environment.ts` (`ConfigurationError`) | Error de configuración de E1 | Sin cambios; se reexporta desde `src/errors` |
| `src/config/` | No existe (la capa es `config/`) | — |

## 2. Implementación

| Archivo | Contenido |
|---|---|
| `src/errors/classifications.ts` | Las 8 clasificaciones, sus tipos, `categoryOf`, `classificationMarker`, `isSqafClassification` |
| `src/errors/sqaf-error.ts` | `SqafError` abstracta, formato del mensaje, redacción de claves secretas |
| `src/errors/infrastructure-error.ts` | `InfrastructureError` (compatible con E1) |
| `src/errors/data-validation-error.ts` | `DataValidationError` (`source`, `issues`) |
| `src/errors/api-error.ts` | `ApiError` (operación, endpoint, estado HTTP, `responseCode`, mensaje, e-mail de la cuenta) |
| `src/errors/failure-classification.ts` | `classifyFailure`, `pageSnapshotSection`, `emptyClassificationCounts` |
| `src/errors/index.ts` | Punto único de importación (incluye `ConfigurationError`) |
| `src/utils/{text,price,unique,duration,guards,index}.ts` | Utilidades comunes |

## 3. Pruebas

### 3.1 Typecheck

`npm run typecheck` da **exit 0**.

### 3.2 Pruebas unitarias de E5 (66 nuevas)

| Archivo | Pruebas | Qué verifica |
|---|---|---|
| `tests/unit/errors/error-hierarchy.spec.ts` | 8 | Herencia, `category`, marcador, inmutabilidad, redacción de secretos, `cause` fuera del mensaje, mensaje **exacto** de E1 de `InfrastructureError`, formato de `DataValidationError` y `ApiError`, `ConfigurationError` reexportado (misma clase) |
| `tests/unit/errors/taxonomy.spec.ts` | 23 | Cada clasificación con mensajes con el formato de Playwright 1.65; prioridad entre reglas; 5 casos negativos de las reglas nuevas; `ERR_BLOCKED_BY_CLIENT` ignorado; orden de los contadores; extracción de `# Page snapshot` |
| `tests/unit/utils/common-utilities.spec.ts` | 35 | `parsePrice` (6 válidos, 7 inválidos), `formatPrice`, ids deterministas con un *token* fijo, 10 000 ids únicos, sin colisiones entre fuentes, e-mails sintéticos, secretos aleatorios, `formatDuration` (9 casos y valores inválidos), texto, HTML y *guards* |

### 3.3 Compatibilidad con E1

| Prueba de E1 | Resultado |
|---|---|
| `anti-bot-guard.spec.ts` (3) | Sin cambios, pasa |
| `anti-bot-detector.spec.ts` (17) | Sin cambios, pasa (importa `normalizeText` del módulo de E1, que ahora lo reexporta) |
| `failure-classification.spec.ts`: 4 casos positivos y 5 negativos anti-bot | Sin cambios, pasan |
| `failure-classification.spec.ts`: caso TC9 de E0 | **Cambia la expectativa**: de `unclassified` a `assertion/mismatch`, y se añade la comprobación de que **no** es infraestructura (la garantía de E1). Mismo número de pruebas (10) |
| `failure-classification-reporter.spec.ts` (4) | **Cambian las expectativas**: `schemaVersion` 2, la muestra `expect(2).toBe(3)` es `assertion/mismatch`, y la consola solo muestra contadores mayores que 0. Siguen verificados los estados, el código de salida y la ausencia de retries especiales |

### 3.4 Defectos encontrados durante la validación

| # | Defecto | Detección | Corrección |
|---|---|---|---|
| 1 | La regla de *timeout* de localizador no reconocía `Test timeout of 30000ms exceeded` en una acción | Prueba unitaria nueva en rojo | Patrón `(?:Timeout\|Test timeout of) \d+ms exceeded` |
| 2 | **Falso positivo del reporter (latente desde E1):** el `error-context.md` de Playwright 1.65 incluye el **código fuente del test**. El reporter lo pasaba entero como texto de la página, y el fallo de un test con `"502: Bad gateway"` en su código se clasificó como `sut-unavailable`. La regla anti-bot de E1 tenía el mismo riesgo (por ejemplo, `tests/integration/fixtures/anti-bot.spec.ts` contiene la frase del desafío) | Clasificación observada en la consola durante la ejecución en rojo del defecto 1 | `pageSnapshotSection()`: solo se usa la sección `# Page snapshot`. Lo cubren 3 pruebas |
| 3 | Un fallo real de DNS en Windows (`getaddrinfo ENOENT`, §E3) no estaba en el patrón heurístico de red. Se clasificó bien por el marcador SQAF, pero un error crudo de Playwright habría quedado `unclassified` | Fallo real durante la primera ejecución de integración de E3 | Patrón `getaddrinfo [A-Z_]+` y prueba con el mensaje real |

### 3.5 Mutaciones controladas

Cada mutación se aplicó con `sed` sobre el código ya confirmado (`3dc07b1`), se ejecutaron las pruebas unitarias indicadas (sin SUT) y se revirtió con `git checkout`. Al terminar, `git status` estaba limpio en `src/`, `tests/` y `config/`.

| # | Mutación | Pruebas ejecutadas | Fallidas |
|---|---|---|---|
| M1 | Sin redacción de claves secretas | `tests/unit/errors` | 1 |
| M2 | Regla anti-bot desactivada | `tests/unit/errors`, `tests/unit/reporting` | 5 |
| M3 | `ERR_BLOCKED_BY_CLIENT` contado como fallo de red | `tests/unit/errors` | 1 |
| M4 | `error-context` completo como texto de página (defecto 2) | `tests/unit/errors` | 2 |
| M8 | La secuencia de ids no avanza | `tests/unit/utils`, `tests/unit/data` | 5 |

Las 5 mutaciones se detectaron. Las de E3 están en [E3 §4.1](E3-test-data-management.md#41-mutaciones-controladas).

## 4. Integraciones reales

E5 no contacta el SUT. La taxonomía se ejercitó con fallos reales en dos ocasiones:

- Un fallo real de infraestructura: la caída de DNS local en la primera ejecución de integración de E3, clasificada `infrastructure/network` con el e-mail de la cuenta y sin la contraseña.
- Un fallo de automatización: el defecto 1, clasificado como se describe en §3.4.

Las reglas `sut-unavailable` y `anti-bot` contra el SUT real no se han observado en el ciclo 1.

## 5. Regresión

Ver [E3-test-data-management.md §7](E3-test-data-management.md#7-regresión-e0e1e2): ambas etapas comparten la misma regresión (203 pruebas unitarias, 20 de integración de E2, 3 corridas de la línea base y SHA-256 sin cambios).

## 6. Limitaciones

- `assertion/mismatch` indica que una expectativa no se cumplió. No distingue un defecto del producto de uno de la automatización (ADR-0008).
- La clasificación se basa en texto. Un mensaje con un formato nuevo de Playwright puede quedar `unclassified` hasta que se observe y se añada su patrón con evidencia.
- La cabecera del resumen del job sigue listando todos los proyectos configurados (pendiente de E2, previsto para E6).
