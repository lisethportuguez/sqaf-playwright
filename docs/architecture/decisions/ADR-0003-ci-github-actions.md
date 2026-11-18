# ADR-0003: Integración continua con GitHub Actions desde la Etapa 0

- **Estado:** Aceptado. Validado en E0 (runs `43689246937`, `43690125007` y `43690457916`). Actualizado en E1 (filtros de rutas, pruebas unitarias y evidencias de fallo) y en E2 (paso de integración).
- **Fecha:** 2026-11-15
- **Etapa:** E0 (actualizado en E1 y E2)

## Contexto

El TFG exige que el framework sea fácil de integrar en los procesos de QA. Si la integración continua se deja para el final, los problemas de entorno (dependencias, navegadores, finales de línea, diferencias entre Windows y Linux) se descubren tarde.

## Decisión

Incorporar **GitHub Actions** desde la Etapa 0 con un workflow (`.github/workflows/ci.yml`) sencillo que evoluciona en cada etapa.

### Diseño inicial

| Aspecto | Decisión | Motivo |
|---|---|---|
| Disparadores | `push` a `main`, `pull_request`, `workflow_dispatch` | Validar cada PR de etapa y permitir ejecuciones manuales |
| Permisos | `contents: read` | Mínimo privilegio |
| Concurrencia | Cancelar ejecuciones obsoletas de la misma rama. **Sustituida en la Etapa 4 (E4.5):** `cancel-in-progress: false` en PR y en `main` (ver «Cambios de la Etapa 4») | Ahorro de minutos y de carga sobre el SUT |
| Node.js | `node-version-file: .nvmrc` | Una sola fuente de la versión para el entorno local y CI |
| Dependencias | `npm ci` con caché de npm | Instalación reproducible desde `package-lock.json` |
| Verificación | `npm run typecheck` antes de las pruebas | Falla rápido ante errores de tipos |
| Navegadores | Solo Chromium (`--with-deps`) | Alcance de E0. Multi-navegador se evaluará más adelante. |
| Workers | 1 (definido en `playwright.config.ts`) | Decisión aprobada. Comparabilidad y uso responsable del SUT. |
| Retries | 0 en el proyecto `baseline` | Medir la estabilidad sin enmascarar fallos |
| Artifact | `playwright-report/`, 14 días, también cuando hay fallos | Evidencia de cada ejecución |
| Secretos | Ninguno | No se requieren: las cuentas de prueba se generan en tiempo de ejecución |

### Cambios de la Etapa 1

| Aspecto | Decisión | Motivo |
|---|---|---|
| Pruebas unitarias | Paso `npm run test:unit` después del typecheck y antes de instalar Chromium | Validan la configuración, el contrato de la línea base, el detector y el reporter sin navegador ni SUT. Si fallan, no se ejecuta la línea base contra el SUT |
| Evidencias de fallo | Artifact `failure-evidence-<run>-<intento>` con `test-results/` y `reports/`, solo si el job falla, 14 días (**restringido en E4.5** a `reports/failure-classification.json`, ver el cierre final) | Diagnóstico de fallos (traces, screenshots y videos de SQAF, y la clasificación de fallos, ADR-0006) |
| Clasificación de fallos | El reporter escribe en `$GITHUB_STEP_SUMMARY` | Un fallo por el desafío anti-bot se identifica en el resumen del job (ADR-0006) |
| Filtros de rutas | `paths` en `push` y `pull_request` (ver abajo) | No ejecutar la línea base contra el SUT por cambios solo documentales |

#### Filtros de rutas

**Contexto.** El 2026-11-15, dos commits que solo modificaban documentación (`dc0bf7b` y `66be969`) ejecutaron la línea base completa contra el SUT, y ambos sufrieron el desafío anti-bot de Cloudflare (ADR-0006). Cada ejecución innecesaria aumenta la carga sobre el SUT y la exposición al desafío.

**Decisión.** Un cambio que **solo** afecta a `docs/**` o a archivos Markdown no ejecuta el workflow. Se usa `paths` con exclusiones y reinclusiones, no `paths-ignore`:

```yaml
paths:
  - '**'                    # todo dispara CI por defecto...
  - '!docs/**'              # ...salvo la documentación
  - '!**.md'                # ...y los archivos Markdown
  - '.github/workflows/**'  # pero estas rutas SIEMPRE disparan CI,
  - 'config/**'             #   aunque el archivo cambiado sea Markdown
  - 'src/**'
  - 'tests/**'
  - 'baseline/**'
  - 'playwright.config.ts'
  - 'tsconfig.json'
  - 'package.json'
  - 'package-lock.json'
  - '.nvmrc'
```

- `paths-ignore` no permite reincluir rutas: un `.md` dentro de `src/` o `config/` quedaría excluido. Con `paths`, GitHub evalúa los patrones en orden y un patrón positivo posterior reincluye lo excluido antes.
- El workflow se ejecuta si **al menos un** archivo modificado queda incluido. Un commit mixto (documentación y código) siempre ejecuta CI.
- Cualquier archivo no excluido (`.gitignore`, `.gitattributes`, `LICENSE`, `.env.example`, JSON de `metrics/`) también dispara CI: el filtro es conservador.
- En `pull_request`, GitHub evalúa el diff completo del PR respecto de la rama base, no solo el último commit.
- **Ejecución manual:** `workflow_dispatch` no tiene filtros y ejecuta siempre el pipeline completo, con la línea base. Se lanza desde la pestaña *Actions* o con `gh workflow run CI --ref <rama>`.
- Las dos listas (`push` y `pull_request`) deben ser idénticas. Lo verifica `tests/unit/ci/workflow-paths.spec.ts`, junto con que cada ruta crítica se reincluya después de la última exclusión y que `workflow_dispatch` no tenga filtro. La verificación con eventos reales está en [E1-configuration.md](../../validation/E1-configuration.md).

**Riesgo aceptado.** Un commit solo documental en `main` no deja un run de CI asociado; el último estado de CI de `main` sigue siendo el del último cambio de código.

### Cambios de la Etapa 2

| Aspecto | Decisión | Motivo |
|---|---|---|
| Nombre del job | `Typecheck, unit, baseline and integration (Chromium)` (antes `Typecheck and baseline (Chromium)`) | Describe el pipeline real. La rama `main` no tiene protección que dependa del nombre del check |
| Paso de integración | `Integration tests (Page Objects and fixtures)`: `npm run test:integration -- --output=test-results-integration`, **después** de la línea base y de la subida de sus evidencias | La integración nunca influye en la ejecución ni en las evidencias de la línea base (ADR-0007) |
| Condición | Solo se ejecuta si todos los pasos anteriores pasaron (condición por defecto) | Si la línea base falla (por ejemplo, por el desafío anti-bot), no se envían más peticiones al SUT |
| Salidas separadas | HTML en `playwright-report-integration/` (`PLAYWRIGHT_HTML_OUTPUT_DIR`; ya no se genera en CI desde E4.5) y resultados en `test-results-integration/` | Playwright limpia su carpeta de resultados en cada ejecución: así no se mezclan con los de la línea base |
| Artifacts | `integration-report-<run>-<intento>` (siempre que el paso se ejecute) e `integration-failure-evidence-<run>-<intento>` (si falla la integración), 14 días. **Sustituido en E4.5** (cierre de seguridad): ver «Cambios de la Etapa 4» | Resultados identificables por separado |
| Resumen del job | Cada paso escribe un encabezado propio (`## Baseline (Stage 0 conditions)` y `## Integration (Page Objects and fixtures)`) antes de la tabla de clasificación de fallos | El reporter de E1 lista en su encabezado todos los proyectos configurados, no solo el ejecutado. El encabezado del paso identifica cada ejecución sin modificar el reporter |
| Navegadores | Sigue siendo solo Chromium | Firefox y WebKit no se ejecutan hasta E4 |
| Workers y retries | Sin cambios: 1 worker en CI; retries globales de E1 (2 en CI para los proyectos SQAF, 0 en `baseline` y `unit`) | Las decisiones de E1 no se modifican |

`tests/unit/ci/workflow-steps.spec.ts` fija el orden (typecheck → unitarias → línea base → integración), que las evidencias de la línea base se suban antes de la integración, las salidas separadas y que solo se instale Chromium. Desde el incidente INC-2026-11-16 también fija que ningún paso publique `playwright-report/`, que la línea base solo publique su JSON de clasificación, que la evidencia de fallo excluya la línea base y que el paso "Run baseline" sea exactamente el de la Etapa 1.

### Cambios de la Etapa 4 (E4.5)

**Implementado en local, sin ejecución en GitHub** (ver [E4-functional-scenarios.md §5](../../validation/E4-functional-scenarios.md#5-e45--integración-con-github-actions)).

| Aspecto | Decisión | Motivo |
|---|---|---|
| Paso nuevo | `Functional scenarios (SQAF e2e)` (id `e2e`), **después** de la integración y de sus artifacts, en el mismo job | Un solo job: no se reinstalan dependencias ni navegador. Sin `if:`: solo se ejecuta si todo lo anterior pasó (menos peticiones al SUT) |
| Selección | `pull_request`: `--grep=@smoke` (6 escenarios, 9 tests, 2 cuentas). `push` a `main` y `workflow_dispatch`: suite completa (15 escenarios, 18 tests, 8 cuentas). Se decide con `$GITHUB_EVENT_NAME` en el propio paso | ADR-0010 D9. Los eventos no cambian: `push` solo a `main`, así un PR no ejecuta dos veces |
| Comando | `npm run test:e2e -- $SELECTION --output=test-results-e2e --reporter=list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts` | `test:e2e` = `playwright test --project=chromium`. Sin `--workers`, `--retries` ni timeouts en el paso |
| Navegador, workers y reintentos | Chromium; 1 worker y 2 reintentos en CI, de `playwright.config.ts` (sin cambios) | Los reintentos no ocultan fallos: el resumen marca `flaky` y clasifica cada intento fallido |
| Reporters | Los reporters de la CLI **sustituyen** a los configurados: no se genera informe HTML ni JSON crudo de e2e | Ambos contendrían los e-mails sintéticos de las cuentas (títulos `Fill` y adjuntos de limpieza) |
| Resumen seguro | Reporter nuevo `src/reporting/run-summary-reporter.ts` (observador): `reports/run-summary.json` y tabla en `$GITHUB_STEP_SUMMARY` con resultado, intentos, duración y clasificación de cada intento fallido. Lee la clasificación del reporter de E1, listado antes (Playwright ejecuta `onEnd` en orden); no la recalcula | Sin mensajes de error, títulos de paso, adjuntos, e-mails, contraseñas ni datos de tarjeta |
| Artifacts | `e2e-summary-<run>-<intento>` (`reports/run-summary.json`, siempre que el paso se ejecute) y `e2e-failure-evidence-<run>-<intento>` (**solo** `test-results-e2e/products-*/`, si falla), 14 días | Las suites de producto no usan cuentas ni formularios. Las de autenticación y checkout no publican evidencias: sus capturas muestran los formularios de registro, login y pago |
| Concurrencia | Mismo grupo (`workflow` + `ref`) y `cancel-in-progress: false` en PR y en `main`: un run en curso nunca se cancela; un push nuevo espera a que termine (GitHub conserva solo el pendiente más reciente) | Los escenarios de autenticación y checkout crean cuentas: cancelar a mitad de un escenario puede impedir el borrado. Sigue sin haber dos runs en paralelo por rama o PR, y 1 worker |
| Sin cambios | Eventos y filtros de rutas, permisos (`contents: read`), nombre y `timeout-minutes: 20` del job, línea base, versiones e instalación (`npm ci`, `npx playwright install --with-deps chromium`) | Restricciones de E4.5 |

`tests/unit/ci/workflow-e2e.spec.ts` fija estas decisiones; `tests/unit/reporting/run-summary-reporter.spec.ts` verifica el reporter con muestras sintéticas.

#### Cierre de seguridad de E4.5: el informe HTML de integración deja de publicarse

El artifact `integration-report` (informe HTML de integración, publicado desde E2) mostraba los e-mails sintéticos de las cuentas de prueba en los títulos de paso `Fill "…"` (Playwright escribe el valor tecleado), y los identificadores de cuenta (`dataId`) en las anotaciones `sqaf-test-data`, los adjuntos `sqaf-account-cleanup` y los `error-context` redactados. Las capturas de fallo muestran además el e-mail como imagen, que no se puede redactar ni escanear.

| Aspecto | Decisión | Motivo |
|---|---|---|
| Paso de integración | `npm run test:integration -- --output=test-results-integration --reporter=list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts`; se elimina `PLAYWRIGHT_HTML_OUTPUT_DIR` | Igual que en e2e: los reporters de la CLI sustituyen a los configurados y **no se genera** informe HTML ni JSON crudo |
| Artifacts | `integration-summary-<run>-<intento>` (`reports/run-summary.json`, siempre que el paso se ejecute, subido **antes** de que el paso e2e escriba el suyo) e `integration-failure-evidence-<run>-<intento>` (si falla) **solo** con las carpetas de `pages/base-page`, `pages/cart`, `pages/products`, `pages/product-components`, `fixtures/anti-bot` y `fixtures/fixtures`, 14 días. Desaparece `integration-report-<run>-<intento>` | Esas suites no usan cuentas, e-mails, contraseñas ni tarjetas. Se excluyen `data/`, `pages/auth`, `pages/checkout-components`, `reporting/`, `security/` y `reports/` (sus extractos de error pueden nombrar una cuenta) |
| Resumen seguro | El mismo reporter de e2e; en el resumen publicado se elimina también el `dataId` (`[e-mail redacted]`), porque el e-mail se reconstruye a partir de él. El encabezado del resumen del job es `SQAF integration tests` | Sin identificadores de cuenta en lo publicado |
| Origen | El adjunto `sqaf-account-cleanup` ya no incluye el e-mail (solo `fixture`, `dataId`, `deleteOutcome` y `verifiedAbsent`). Los títulos `Fill "…"` no se sanean: exigiría cambiar los Page Objects (`fill` es la acción probada) y no basta, porque las capturas muestran el valor | Defensa en profundidad sin debilitar las pruebas |

`tests/unit/ci/workflow-integration-artifacts.spec.ts` fija estas decisiones (contratos estáticos). `tests/integration/security/integration-artifacts.spec.ts` las verifica en ejecución, con un SUT falso, aplicando el comando y las rutas de subida de `ci.yml` y escaneando lo que se publicaría.

#### Cierre final de E4.5: logs y evidencias de unitarias y línea base

| Aspecto | Decisión | Motivo |
|---|---|---|
| Logs de consola | `redactEmails` sustituye toda dirección por `[e-mail redacted]`, sin `dataId` | El e-mail se reconstruye a partir del `dataId`, y el log de un repositorio público es visible |
| "Upload failure evidence" (E1) | Publica **solo** `reports/failure-classification.json` (extractos y títulos redactados, clasificación, archivo y línea). Ya no publica `test-results/` | Las salidas crudas de las unitarias muestran marcos de código con e-mails y credenciales de URL ficticios; las de la línea base pueden contener la contraseña de TC1 (INC-2026-11-16). El código es público: archivo y línea bastan |
| Sin cambios | "Run baseline" y "Upload baseline classification" | Evidencia protegida de E0 |

Tras un fallo de las unitarias o de la línea base solo pueden ejecutarse "Upload baseline classification" y "Upload failure evidence", y ambos publican el mismo archivo. Lo fija y lo verifica en ejecución `tests/unit/ci/workflow-failure-evidence.spec.ts`.

### Cambios de la Etapa 6 (informe Allure)

Detalle y justificación en [ADR-0011](ADR-0011-allure-report.md) D12. Contratos en `tests/unit/ci/workflow-allure.spec.ts`.

| Cambio | Paso | Motivo |
|---|---|---|
| Permiso `actions: read`, además de `contents: read` | `permissions` | Leer los artefactos de historial de ejecuciones anteriores; ningún permiso de escritura |
| Descarga del historial en solo lectura (último *push* completado en `main`) | "Download Allure history (read-only)", después de la línea base y antes de Integration | Tendencias en PR y en `main` sin poder modificar el historial desde un PR |
| Reporter Allure añadido al final de la lista | "Integration tests …" y "Functional scenarios (SQAF e2e)" | Informe saneado y escaneado; el de Integration no añade entrada de historial y el de E2E añade la de toda la ejecución |
| Publicación del informe escaneado (14 días) | "Upload Allure report" | Solo `allure-report/`; si hubo un hallazgo, el informe se borró y no hay nada que publicar |
| Publicación del historial (90 días), solo en *push* a `main` | "Upload Allure history" | Los PR y las ejecuciones manuales nunca escriben el historial |
| Bloqueo visible | "Check Allure pipeline" (último paso) | Falla si el estado del pipeline no es seguro o si no existe |
| Sin cambios | Línea base, typecheck, unitarias, resúmenes y evidencias de fallo | La línea base E0 no usa Allure (no es un reporter configurado) |

Nunca se publican `allure-results/` ni `allure-results-safe/`, y no se usa GitHub Pages.

### Configuración necesaria en GitHub

No se necesitan *secrets* ni *variables*. Solo hay que crear el repositorio público `sqaf-playwright` y hacer push.

## Evolución prevista

- E1 (hecho): artifacts de evidencias cuando hay fallos, pruebas unitarias, clasificación de fallos en `$GITHUB_STEP_SUMMARY` y filtros de rutas.
- E2 (hecho): paso de integración de Page Objects y fixtures con artifacts propios.
- E3/E5 (PR #6, incidente [INC-2026-11-16](../../security/INC-2026-11-16-baseline-report-credentials.md)): **el informe HTML de la línea base deja de publicarse**, porque registraba el valor tecleado por `fill(password)` en TC1. La línea base publica solo `reports/failure-classification.json` (paso "Upload baseline classification", con extractos redactados), y "Upload failure evidence" excluye sus salidas (`!test-results/*-baseline/**`). El paso "Run baseline" y los escenarios no cambian. El informe HTML de integración se sigue publicando (hasta el cierre de seguridad de E4.5). Lo fijan los contratos de `tests/unit/ci/workflow-steps.spec.ts`.
- E4 (E4.5, implementado en local, pendiente de ejecución en GitHub): paso de escenarios funcionales filtrado por etiquetas (`@smoke` en PR, suite completa en `main`) con resumen seguro. Cierre de seguridad: el informe HTML de integración deja de publicarse y se sustituye por su resumen seguro. Cierre final: ningún `dataId` en los logs, y la evidencia de fallo de unitarias y línea base se limita a la clasificación de fallos.
- E6: reportes JSON y JUnit, historial de métricas y resumen completo en `$GITHUB_STEP_SUMMARY`.
- E7 (opcional): ejecución programada y matriz multi-navegador.

## Consecuencias

- Cada PR de etapa queda validado de forma automática y reproducible.
- Las acciones se referencian por versión mayor (`@v5`, `@v4`). Fijarlas por SHA es una mejora de seguridad que se puede evaluar más adelante.
- Advertencias de la plataforma (revisadas en E2): `actions/upload-artifact@v4` declara Node.js 20, que está obsoleto (GitHub la ejecuta forzada con Node.js 24), y la etiqueta `ubuntu-latest` está migrando a Ubuntu 26 (el runner ya usa `ubuntu-26.04`). Ninguna afecta a los resultados. Las recomendaciones (evaluar `upload-artifact@v6` o posterior y fijar la imagen del runner para la Etapa 7) requieren autorización: ver [E2-page-objects-fixtures.md §13](../../validation/E2-page-objects-fixtures.md#13-advertencias-de-la-plataforma-de-ci).
- Las pruebas en CI dependen de la disponibilidad del SUT externo.
