# Guía de uso de SQAF: ejecución y consulta de resultados

Guía práctica para ejecutar SQAF en local (PowerShell en Visual Studio Code) y consultar sus resultados y los del CI. La arquitectura está en [architecture.md](architecture/architecture.md) y las decisiones de reporting en [ADR-0011](architecture/decisions/ADR-0011-allure-report.md).

> **Antes de empezar**
> - La línea base, Integration y E2E usan el **SUT real** (automationexercise.com). Crean cuentas de prueba sintéticas (que se borran y verifican) y pueden encontrar el desafío anti-bot de Cloudflare, que se clasifica como `infrastructure/anti-bot-challenge`.
> - En PowerShell, usa `npx playwright test …` cuando añadas opciones. Con `npm run <script> -- <opciones>`, `npm.ps1` puede perder el `--`.
> - `npm test` ejecuta **todos** los proyectos, también Firefox y WebKit, que normalmente no están instalados. Para reproducir el CI, usa los comandos de la sección 2.

## 1. Scripts de `package.json`

| Script | Comando | Para qué sirve |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | Comprobación de tipos |
| `npm test` | `playwright test` | Todos los proyectos |
| `npm run test:unit` | `playwright test --project=unit` | Pruebas unitarias del framework (sin navegador ni SUT) |
| `npm run test:baseline` | `playwright test --project=baseline` | Línea base E0 (condiciones congeladas) |
| `npm run test:integration` | `playwright test --project=integration` | Page Objects y fixtures (40 tests) |
| `npm run test:e2e` | `playwright test --project=chromium` | Los 15 escenarios funcionales (18 tests) |
| `npm run test:allure` | Integration + E2E con clasificación, resumen seguro y Allure | Ejecución completa con **un** informe Allure y **una** entrada de historial |
| `npm run test:integration:allure` | Integration + Allure | Informe Allure de Integration (sin entrada de historial) |
| `npm run test:e2e:allure` | E2E + Allure | Informe Allure de E2E, combinado con los últimos resultados de Integration preparados |
| `npm run report` | `playwright show-report` | Abre el informe HTML de Playwright (`playwright-report/`) |
| `npm run report:allure` | `allure open allure-report --host 127.0.0.1` | Sirve el informe Allure solo en este equipo |

## 2. Ejecutar las suites

```powershell
npx playwright test --project=unit          # unitarias del framework
npx playwright test --project=baseline      # línea base E0 (5 tests)
npx playwright test --project=integration   # 40 tests
npx playwright test --project=chromium      # 18 tests E2E
npx playwright test --project=chromium --grep=@smoke   # los 9 @smoke (lo que ejecuta un PR)
npm run test:allure                          # Integration + E2E con informe Allure
```

**Mismo orden y opciones que el CI.** Con `CI=1` hay 2 reintentos, 1 worker y vídeo en los fallos. Cada paso solo se ejecuta si el anterior pasó:

```powershell
$env:CI = '1'
$R = 'list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts,./src/reporting/allure-reporter.ts'
npm run typecheck
if ($?) { npx playwright test --project=unit }
if ($?) { npx playwright test --project=baseline }
if ($?) { npx playwright test --project=integration --output=test-results-integration --reporter=$R }
if ($?) { npx playwright test --project=chromium --output=test-results-e2e --reporter=$R }
Remove-Item Env:CI
```

## 3. Un archivo o un escenario

```powershell
npx playwright test tests/e2e/products/tc09-search-product.spec.ts --project=chromium
npx playwright test --project=chromium --grep "TC1:"      # solo TC1 ("TC1" sin ':' también selecciona TC12–TC18)
npx playwright test --project=chromium --grep "@account"  # por etiqueta: @smoke, @regression, @account
npx playwright test --project=chromium --list             # lista sin ejecutar
npx playwright test tests/e2e/products/tc12-add-products-in-cart.spec.ts --project=chromium --headed
```

Para un informe Allure de una selección, añade el reporter: `npx playwright test tests/e2e/products --project=chromium --reporter=$R` (con `$R` como en la sección 2).

## 4. Reportes locales

Todo se genera, no se versiona (`.gitignore`) y se sobrescribe en cada ejecución.

| Qué | Dónde | Cuándo |
|---|---|---|
| Informe HTML de Playwright | `playwright-report/` | Sin la opción `--reporter`. **Contiene los valores tecleados: no lo compartas** |
| Clasificación de fallos | `reports/failure-classification.json` | Siempre |
| Resumen seguro | `reports/run-summary.json` | Con `run-summary-reporter.ts` en `--reporter` (scripts `*:allure` y CI) |
| **Informe Allure** | `allure-report/` (`awesome/index.html` es el informe; `dashboard/index.html`, las tendencias) | Con `allure-reporter.ts` en `--reporter` |
| Historial Allure | `allure-history/history.jsonl` | Una entrada por cada ejecución que incluye E2E |
| Estado del pipeline Allure | `reports/allure-status.json` | Con Allure: `generated`, o `blocked-*` si encontró datos sensibles (sin valores) |
| Resultados Allure crudos y preparados | `allure-results/`, `allure-results-safe/` | Internos: el crudo **contiene valores tecleados**; nunca se publican |
| Evidencias de fallo | `test-results/`, `test-results-integration/`, `test-results-e2e/` | Solo en fallos |

**Abrir y consultar:**

```powershell
npm run report:allure                                     # http://127.0.0.1:<puerto>; Ctrl+C para cerrar
Start-Process allure-report\awesome\index.html            # o doble clic: es un solo archivo
npx playwright show-report                                # informe de Playwright
npx playwright show-trace test-results\<carpeta>\trace.zip
Get-Content reports\allure-status.json | ConvertFrom-Json
```

**En el informe Allure** puedes consultar:
- **Árbol de resultados:** `E2E (chromium)` → `Authentication` / `Products` / `Checkout` → `TCn: …`, e `Integration` → área → archivo. Desde ahí se abre cada caso, con sus pasos y la duración de cada uno.
- **Casos dirigidos por datos** (TC3, TC9): aparecen bajo su escenario, con el parámetro `Case`.
- **Enlace «Official TCn»** al caso oficial y etiqueta `baselinePair` con el test equivalente de la línea base.
- **Categorías:** los fallos agrupados por la clasificación SQAF.
- **Estadísticas y línea de tiempo**, y el **panel de tendencias** (`dashboard`) con el historial.

## 5. Resúmenes JSON y métricas versionados

| Archivo | Contenido |
|---|---|
| `metrics/experiments/E0-baseline/` | Medición de la línea base E0 |
| `metrics/experiments/E4-sqaf/` | Medición de E4.4: duraciones, clasificación y cuentas seudonimizadas |
| `metrics/verification/` | Verificaciones de la línea base en cada etapa |
| `docs/validation/E*.md` | Registros de validación por etapa |

## 6. Artefactos de GitHub Actions

Necesitas `gh` con sesión iniciada (`gh auth login`). También puedes descargarlos desde **Actions** → el run → **Artifacts**.

```powershell
gh run list --branch main --limit 5
gh run view <run-id>
gh run view <run-id> --log-failed
gh run download <run-id> -n allure-report-<run-id>-<intento> -D $env:TEMP\sqaf-allure   # fuera del repositorio
Start-Process "$env:TEMP\sqaf-allure\awesome\index.html"
```

| Artefacto | Retención | Contenido |
|---|---|---|
| `allure-report-<run>-<intento>` | 14 días | **Solo** el informe Allure ya escaneado (Integration + E2E). Si el pipeline encontró datos sensibles, no se publica y el run falla en «Check Allure pipeline» |
| `allure-history-<run>-<intento>` | 90 días | El historial, **solo** de *push* a `main`. Los PR lo leen pero no lo publican |
| `baseline-classification-…` | 14 días | Clasificación de la línea base |
| `failure-evidence-…` | 14 días | Solo la clasificación, si fallan las unitarias o la línea base |
| `integration-summary-…`, `e2e-summary-…` | 14 días | Resúmenes seguros |
| `integration-failure-evidence-…`, `e2e-failure-evidence-…` | 14 días | Evidencias de fallo de las suites sin cuentas |

**Nunca se publican:** `allure-results/`, `allure-results-safe/`, los informes HTML de Playwright ni las salidas crudas.

## 7. Datos sensibles y capturas

- **Nunca aparecen en el informe Allure ni en lo que publica el CI:**
  - e-mails, que se ven como `[e-mail redacted]`;
  - contraseñas y pares de contraseña, como `[REDACTED]`;
  - tarjetas, como `[card redacted]`;
  - `dataId` de cuentas, como `[data id redacted]`;
  - valores tecleados en formularios, rutas locales y nombre del equipo.
- **No se adjuntan nunca:** trazas, vídeos, contextos de error, salida de consola ni registros de limpieza de cuentas.
- **Capturas:** solo las de fallo de `tests/e2e/products/` y de las suites de Integration sin cuentas (`pages/base-page`, `pages/cart`, `pages/products`, `pages/product-components`, `fixtures/anti-bot`, `fixtures/fixtures`). Es la misma lista que las evidencias de fallo del CI (`config/allure.ts`).
- **Limitación:** las capturas son imágenes y el escáner no puede leerlas. Las de Authentication y Checkout nunca se incluyen, porque muestran formularios.
- **Bloqueo:** si el escáner encuentra un dato sensible, el informe se borra, el historial vuelve a su estado anterior y `reports/allure-status.json` indica el detector y el archivo, nunca el valor.
- **Archivos locales que no se comparten:** `playwright-report/` y `allure-results/` contienen los valores sintéticos tecleados.

## 8. PowerShell en VS Code: resumen

```powershell
cd <carpeta-del-repositorio>          # la raíz de tu clon
npm ci                               # primera vez o si cambia package-lock.json
npx playwright install chromium      # primera vez
npm run typecheck
npx playwright test --project=unit
npm run test:allure                  # Integration + E2E contra el SUT, con informe Allure
npm run report:allure
```

- La variable de entorno se define con `$env:CI = '1'` y se borra con `Remove-Item Env:CI`.
- En PowerShell, pon entre comillas los argumentos que empiezan por `@`, como `"@account"`.
- `SQAF_ENV` solo admite `production`, que es el valor por defecto.
