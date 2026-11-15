# ADR-0005: Capa de configuración centralizada y aislamiento de la línea base

- **Estado:** Aceptado
- **Fecha:** 2026-11-15
- **Etapa:** E1

## Contexto

Al cierre de la Etapa 0, `playwright.config.ts` contenía directamente la URL del SUT, los retries, los workers y la política de trace, sin variables de entorno ni validación. La línea base heredaba la configuración global, de modo que cualquier ajuste pensado para SQAF (timeouts, evidencias) podía alterar sin aviso las condiciones del experimento de la Etapa 7.

## Decisión

### 1. Módulos de `config/`

| Módulo | Responsabilidad |
|---|---|
| `environments.ts` | Catálogo tipado de entornos. Hoy solo `production` (`https://automationexercise.com`), porque el SUT tiene un único entorno público |
| `environment.ts` | Lee y valida `SQAF_ENV` y `SQAF_BASE_URL`; carga `.env` si existe; define `ConfigurationError` |
| `timeouts.ts` | Timeouts de SQAF y de la línea base |
| `evidence.ts` | Política de trace, screenshot y video de SQAF y de la línea base |
| `anti-bot.ts` | Firmas del desafío anti-bot del SUT (ver ADR-0006) |
| `index.ts` | Punto único de importación: `sqafConfig`, resuelto una vez, validado e inmutable (`Object.freeze`) |

`playwright.config.ts` solo consume `sqafConfig`: ya no contiene valores escritos directamente.

### 2. Variables de entorno

| Variable | Valores | Por defecto |
|---|---|---|
| `SQAF_ENV` | `production` | `production` |
| `SQAF_BASE_URL` | Origen `http(s)` sin ruta, query, fragmento ni credenciales | URL del entorno |
| `CI` | Cualquier valor no vacío significa CI (misma semántica que en E0) | — |

- `.env` es **opcional** y no se versiona; `.env.example` documenta las variables.
- Se carga con `process.loadEnvFile()` (nativo de Node.js). **No se agrega `dotenv`.**
- `process.loadEnvFile()` no sobrescribe variables ya definidas: los valores del shell y de CI siempre prevalecen (verificado en Node.js v26.13.1 y cubierto por una prueba unitaria).
- Un valor inválido lanza `ConfigurationError` antes de ejecutar ninguna prueba, con el nombre de la variable y los valores permitidos.

### 3. Timeouts

| Valor | SQAF | Línea base (E0) |
|---|---|---|
| Test | 30 s | 30 s |
| `expect` | 5 s | 5 s |
| Acción | 10 s | 0 (sin límite propio) |
| Navegación | 30 s | 0 (sin límite propio) |

En SQAF, limitar acciones y navegaciones produce fallos más tempranos y con un mensaje más preciso que agotar el timeout del test. Son límites superiores de esperas por condición, nunca esperas fijas.

### 4. Política de evidencias

| Evidencia | SQAF local | SQAF en CI | Línea base |
|---|---|---|---|
| Trace | `retain-on-failure` | `retain-on-failure` | `off` |
| Screenshot | `only-on-failure` | `only-on-failure` | `off` |
| Video | `off` | `retain-on-failure` | `off` |

Solo se conservan evidencias de los fallos. En CI se publican como artifact `failure-evidence-*` (ADR-0003).

### 5. Aislamiento de la línea base

El proyecto `baseline` declara **explícitamente** todas las condiciones de E0, para que ninguna opción global de SQAF pueda filtrarse:

| Condición | Valor |
|---|---|
| Navegador | Chromium (`devices['Desktop Chrome']`) |
| Workers | 1 (límite del proyecto; además, 1 global en CI) |
| Retries | 0 |
| Timeout del test / `expect` | 30 s / 5 s |
| Timeout de acción / navegación | 0 / 0 |
| Trace / screenshot / video | `off` / `off` / `off` |
| URL del SUT | Siempre `https://automationexercise.com`: `SQAF_ENV` y `SQAF_BASE_URL` **no** se aplican |

La configuración global ya no define `use`, `timeout` ni `expect`: cada proyecto declara los suyos.

#### Relación entre `retries: 0` y `trace: 'on-first-retry'`

En E0, la configuración global declaraba `trace: 'on-first-retry'` y el proyecto `baseline` usaba `retries: 0`. Como nunca hay un primer reintento, **nunca se grabó un trace**: el valor efectivo era `off`. En E1 se declara `trace: 'off'` de forma explícita. **El comportamiento efectivo no cambia**; solo desaparece la ambigüedad. Una prueba de contrato fija ambos hechos.

#### Workers en local

En E0, el límite de 1 worker en local lo aportaba el comando (`--workers=1`). En E1 el proyecto `baseline` lo declara (`workers: 1`), así que `npm run test:baseline` usa 1 worker también sin la opción. Las corridas registradas de E0 y E1 usaron el mismo comando con `--workers=1`, por lo que sus condiciones son idénticas.

### 6. Prueba de contrato

`tests/unit/config/baseline-contract.spec.ts` verifica:

1. Los **valores efectivos** resueltos por el propio Playwright (`--list` con un reporter sonda, sin navegador ni SUT) en tres entornos: local, CI, y CI con `SQAF_ENV`/`SQAF_BASE_URL` definidos. Comprueba retries, timeout, el `use` completo (dispositivo, URL, timeouts de acción y navegación, evidencias), los 5 escenarios y 1 worker en CI.
2. Los **valores declarados** de `expect.timeout` y `workers` del proyecto, que Playwright no expone en el proyecto resuelto, y la ausencia de opciones globales que pudieran sobrescribirlos.

Una mutación controlada (trace `on-first-retry` y `expect` de 10 s en la línea base) hizo fallar 5 pruebas de contrato.

## Alternativas descartadas

- **`dotenv`:** innecesario con `process.loadEnvFile()` en Node.js ≥ 20.12.
- **Validación con una biblioteca de esquemas (p. ej. `zod`):** dos variables no justifican una dependencia nueva.
- **Varios entornos ficticios (`staging`, `qa`):** el SUT no los tiene; se añadirán en `environments.ts` si existieran.

## Consecuencias

- Toda la configuración se obtiene de `config/index.ts` y se valida al arrancar.
- Cambiar una condición de la línea base exige modificar el contrato, lo que hace visible el cambio en la revisión. Solo debe hacerse con un ADR aprobado.
- La configuración global es más explícita: cada proyecto declara su `use`, timeouts y evidencias.
