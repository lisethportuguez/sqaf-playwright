# INC-2026-11-16: credenciales en el informe HTML de la línea base E0

- **Fecha de detección:** 2026-11-16 (revisión del CI del PR #6, run `43795086819`)
- **Severidad:** baja–media. Las cuentas expuestas eran sintéticas, de un solo uso y ya estaban eliminadas, pero el valor se publicó en artefactos descargables de un repositorio público
- **Estado:** **cerrado.** Corregido en el PR #6 (commit `b977401`), validado en CI (run `43798520805`) y en el CI posterior al merge (`43802704575`, sin informe HTML de E0 ni contraseñas). Los **12 artefactos afectados** fueron eliminados (§6). Incluido en `v0.4.0`
- **Decisiones relacionadas:** [ADR-0003](../architecture/decisions/ADR-0003-ci-github-actions.md) (artefactos de CI), [ADR-0008](../architecture/decisions/ADR-0008-error-handling-utilities.md) D13 (redacción del reporter), [ADR-0009](../architecture/decisions/ADR-0009-test-data-management.md) D16 (política de credenciales de las suites SQAF)

Este documento no contiene contraseñas, direcciones de correo ni otros datos de las cuentas.

## 1. Hallazgo

El escenario TC1 de la línea base congelada (`baseline/baseline.spec.ts`) registra una cuenta sintética por la UI y escribe su contraseña con `locator.fill(password)`. Playwright guarda el valor tecleado en el **título del paso** (`Fill "<valor>"`), y el informe HTML incluye los pasos de todos los tests, también de los que pasan.

Desde la Etapa 1, CI subía ese informe (`playwright-report/`) como artefacto en **todas** las ejecuciones, con 14 días de retención, en un repositorio público.

## 2. Causa técnica

| Vía | Cuándo | Dónde aparece el valor |
|---|---|---|
| Título del paso `Fill "<valor>"` | Siempre | Informe HTML |
| *Call log* `- fill("<valor>")` | Solo si `fill` falla **después** de localizar el campo (por ejemplo, elemento no editable) | Consola, JSON nativo de Playwright, `failure-classification.json` de SQAF y `error-context.md` |
| Snapshot de accesibilidad `textbox "Password": <valor>` | Si falla una aserción con la contraseña aún en el formulario | `error-context.md` |

Si el campo no existe, el valor no aparece. Las tres vías se reprodujeron en local con un servidor falso, sin el SUT y con valores ficticios.

La política de evidencias de la línea base (sin traza, captura ni video) no protege el informe HTML ni el *call log*: no son evidencias opcionales, son parte del informe.

## 3. Impacto

- **11 artefactos históricos** `playwright-report-*` contenían la contraseña de la cuenta de TC1 de su ejecución. Más **1 artefacto** del propio PR #6 (§6).
- **Las 11 cuentas no existen:** se verificaron una a una con la API 14 (solo lectura). Las 11 respuestas fueron `responseCode 404`. TC1 borra su cuenta por la UI y, si no lo consigue, por la API en `afterEach`.
- **Logs de CI:** 0 apariciones en los runs revisados. El *call log* solo llega a la consola si `fill` falla con el campo ya localizado, y eso no ocurrió en ninguna ejecución.
- **Repositorio:** 0 contraseñas en los archivos versionados y en todo el historial de git.
- **Informes de integración de E2** (4 artefactos): contienen la contraseña **ficticia** de un formulario de alta que nunca se envía, así que no hay cuenta. No es una credencial; se conservan. Desde el ciclo 1 `fillSecret` también la oculta.

## 4. Corrección aplicada

| Pieza | Cambio |
|---|---|
| `.github/workflows/ci.yml` | Se elimina la subida del informe HTML de la línea base. El nuevo paso **"Upload baseline classification"** publica solo `reports/failure-classification.json`. "Upload failure evidence" excluye las salidas de la línea base (`!test-results/*-baseline/**`). El paso "Run baseline" **no cambia** |
| `src/reporting/failure-classification-reporter.ts` | `errorExcerpt` se redacta **antes de recortarse**: valores de `fill`/`type`/`pressSequentially`/`insertText` (*call log* y títulos), contraseñas con prefijo `Sqaf#` de cualquier longitud y pares secretos de formularios, JSON y cabeceras. La clasificación usa el texto original |
| `src/utils/redaction.ts` | `redactTypedValues` y patrón `Sqaf#` de longitud 16 o más (cubre también el formato de la línea base) |
| `tests/unit/ci/workflow-steps.spec.ts` | Contratos: ningún paso publica `playwright-report/`; la línea base solo publica su JSON; la evidencia de fallo excluye la línea base; el paso de la línea base es exactamente el de la Etapa 1; el informe de integración se sigue publicando |
| `tests/unit/reporting/failure-classification-reporter.spec.ts` | Redacción de `fill`, `type` y `pressSequentially`; contraseñas generadas; redacción antes del recorte; diagnóstico ordinario intacto; el JSON final no contiene valores sensibles |

Sin cambios: `baseline/baseline.spec.ts`, `config/evidence.ts`, `playwright.config.ts`, los cinco escenarios, sus datos, las dependencias y `package-lock.json`.

El informe HTML de la línea base **se sigue generando** en el runner de CI, que es efímero, pero ya no se publica.

## 5. Validación

| Prueba | Dónde | Resultado |
|---|---|---|
| Typecheck | Local y CI | Sin errores |
| Unitarias | Local y CI (`43798520805`) | 238/238 (10 nuevas) |
| Mutaciones (HTML publicado de nuevo, exclusión eliminada, paso de la línea base alterado, redacción eliminada) | Local | 4/4 detectadas |
| Sonda de `fill` fallido con el reporter real | Local, sin SUT | El valor aparece en la consola y en el JSON nativo; **0** en `failure-classification.json` (`fill("[REDACTED]")`) |
| Línea base E0 completa | Local (`CI=1`) | 5/5; consola y JSON de clasificación con 0 valores; el HTML local (no publicado) sí lo contiene; la cuenta de TC1 devuelve 404 |
| Línea base E0 | CI (`43798520805`) | 5/5, sin reintentos |
| Integración | CI (`43798520805`) | 30/30 |
| Artefactos del run `43798520805` | CI | Solo `baseline-classification-43798520805-1` (524 bytes, 0 fallos, 0 secretos) e `integration-report-43798520805-1` (0 contraseñas; los 6 pasos `Fill` de campos de contraseña tienen valor vacío). **Ningún `playwright-report-*`** |
| Log del run `43798520805` | CI | 0 apariciones de `Sqaf#` y 0 pasos `Fill` |

## 6. Artefactos históricos retirados

Con autorización, tras verificar las 11 cuentas (404), se eliminaron **solo los artefactos**. Los runs, sus logs y su estado se conservan, y las referencias a run IDs de la documentación siguen siendo válidas.

| Run | Artefacto | ID | Resultado |
|---|---|---|---|
| 43689246937 | playwright-report-43689246937-1 | 14152105389 | Eliminado (404 tras borrar) |
| 43690125007 | playwright-report-43690125007-1 | 14151717512 | Eliminado (404 tras borrar) |
| 43690457916 | playwright-report-43690457916-1 | 14152645302 | Eliminado (404 tras borrar) |
| 43690859628 | playwright-report-43690859628-2 (segundo intento) | 14152567017 | Eliminado (404 tras borrar) |
| 43693825486 | playwright-report-43693825486-1 | 14154215109 | Eliminado (404 tras borrar) |
| 43694142521 | playwright-report-43694142521-1 | 14153407041 | Eliminado (404 tras borrar) |
| 43752248014 | playwright-report-43752248014-1 | 14176698472 | Eliminado (404 tras borrar) |
| 43755588344 | playwright-report-43755588344-1 | 14178345799 | Eliminado (404 tras borrar) |
| 43755950821 | playwright-report-43755950821-1 | 14178540540 | Eliminado (404 tras borrar) |
| 43759470542 | playwright-report-43759470542-1 | 14179398621 | Eliminado (404 tras borrar) |
| 43760513829 | playwright-report-43760513829-1 | 14180092513 | Eliminado (404 tras borrar) |

Se conservan, por no contener la contraseña: `playwright-report-43690859628-1` (primer intento, desafío anti-bot) y `playwright-report-43691579360-1`, más los informes de integración.

**Artefacto adicional (eliminado con autorización posterior):**

| Run | Artefacto | ID | Resultado |
|---|---|---|---|
| 43795086819 | playwright-report-43795086819-1 (CI del PR #6 antes de la corrección) | 14193813624 | Eliminado (404 tras borrar). Run y log conservados |

No figuraba en la primera lista autorizada por un error de conteo del análisis previo. Antes de borrarlo se confirmó que el ID seguía correspondiendo al artefacto y que su cuenta de TC1 no existía (`responseCode 404`).

**Total eliminado: 12 artefactos** (11 iniciales y 1 adicional). En el repositorio solo quedan los 2 informes de línea base que se verificaron sin contraseña.

## 7. Riesgo residual

- **Consola de CI:** si el `fill(password)` de TC1 falla **después** de localizar el campo, Playwright imprime el valor en el *call log* y llega al log del run. Evitarlo exige modificar la línea base congelada, lo que no está autorizado. **Procedimiento:** si un run de CI muestra un fallo de `fill` en TC1, se revisa su log y, con autorización, se borra ese log (`gh run delete-logs`, o desde la interfaz). La cuenta afectada se verifica con la API 14.
- **Evidencia de fallo:** la exclusión `!test-results/*-baseline/**` solo actúa cuando el job falla; todavía no se ha ejercitado en CI. Su texto lo fija el contrato del workflow.

## 8. Limitaciones de diagnóstico

Sin el HTML de la línea base en CI, un fallo de E0 se diagnostica con:
- la consola del run (el reporter `list` muestra cada escenario, su error y el código fuente afectado);
- el resumen del job (clasificación de cada fallo);
- `baseline-classification-*.json` (clasificación, evidencia y extracto redactado del error).

No hay pasos, tiempos por paso ni `error-context.md` de la línea base en CI. Para un diagnóstico detallado se reproduce en local, donde el informe HTML sigue disponible y no se publica.
