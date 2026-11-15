# Validación E2: Page Objects y fixtures

- **Etapa:** E2, Page Objects y fixtures
- **Rama:** `stage/2-page-objects` (creada desde `main` en `1eb09f5`, commit de merge de E1, tag `v0.2.0`)
- **Fecha:** 2026-11-15
- **Decisiones:** [ADR-0007](../architecture/decisions/ADR-0007-page-objects-fixtures.md) (D1–D11, aprobadas antes de la implementación)

## 1. Alcance

| Incluido | Excluido (otras etapas) |
|---|---|
| `BasePage`, `HeaderComponent`, `ProductCard`, `CartModal` y 8 páginas | Datos externos, `src/data`, JSON, clientes de API, aprovisionamiento y limpieza de cuentas (E3) |
| Fixtures: bloqueo de anuncios automático, una fixture por Page Object y `@sqaf/fixtures` | Los 15 escenarios funcionales, tags y trazabilidad (E4) |
| Guard anti-bot integrado en la navegación | Taxonomía completa de errores (E5) |
| Proyecto `integration` y su paso de CI | Firefox y WebKit (E4) |
| Política de localizadores `data-qa`, *path aliases* y prueba de la regla de dependencias | Cambios en la línea base, retries, workers o timeouts |

## 2. Control de cambios

### 2.1 Estado inicial (bloque 0)

| Comprobación | Resultado |
|---|---|
| `git status` | Limpio, sin stash |
| `main` frente a `origin/main` | Sincronizadas en `1eb09f5ac0266022c56147c52a0d1a9638d0017e` |
| Tag `v0.2.0` | Apunta a `1eb09f5` |
| Ramas existentes | `main`, `stage/0-bootstrap` y `stage/1-configuration` (no se eliminó ninguna) |
| Rama de trabajo | `stage/2-page-objects`, creada desde `main` |

### 2.2 Archivos protegidos (SHA-256)

| Archivo | SHA-256 (antes = después) |
|---|---|
| `baseline/baseline.spec.ts` | `ebf863f5b68c7a090e7861ef41d34106df33db9b17687382e154bca40716cf2c` |
| `config/ad-blocking.ts` | `0669a541d04144c52ff119c6e5755f155610ae47c86bada774d3d6a38dd7a19a` |
| `package-lock.json` | `f77c95b8566751a80eb972eb7841851be51acb6ff7d732c3ce84a7ee7ff3ac62` |
| `metrics/experiments/E0-baseline/summary.json` | `963781da4e9b93629e2c80110b950905042eacb85422b3aa7d232204bdeb2fff` |

Los valores se tomaron al inicio (bloque 0) y se verificaron con `sha256sum -c` después de las pruebas de integración, después de las mutaciones y después de las corridas de la línea base. No hay dependencias nuevas ni cambios de versión (Node.js 26, Playwright 1.65.0, TypeScript 7.0.2). `package.json` sigue en `0.1.0` (ver §7).

## 3. Decisiones ejecutadas

| # | Implementación |
|---|---|
| D1 | `src/pages/base.page.ts`: `page`, `header`, `open()`, `waitUntilReady()` (`load` → `assertNoAntiBotChallenge` → `assertReady()`), `assertReady()` abstracta y `navigateTo()` protegida |
| D2–D3 | Los Page Objects exponen `readonly Locator` y acciones. No hay aserciones de negocio ni envoltorios de `expect`, `click` o `fill` |
| D4 | `config/locators.ts` (`testIdAttribute: 'data-qa'`) aplicado solo en `sqafUse`. Contrato: `tests/unit/config/sqaf-projects-contract.spec.ts` |
| D5 | `src/fixtures/pages.fixture.ts`: 8 fixtures independientes y perezosas sobre el `page` del test |
| D6 | Las navegaciones por clic devuelven `Promise<void>`. Ningún Page Object crea otro Page Object |
| D7 | Proyecto `integration` (`tests/integration`, Desktop Chrome, `sqafUse`, sin retries ni workers propios) y su paso en CI después de la línea base |
| D8 | No se crea ninguna cuenta. `AccountInformationPage.fill()` no envía el formulario |
| D9 | Interfaces `LoginCredentials`, `SignupIdentity` y `AccountDetails` en `src/pages`. No existe `src/data` |
| D10 | Spike positivo (§4): alias `@sqaf/*` → `src/*` |
| D11 | Sin `describe.serial`, `storageState`, páginas de worker ni estado global |

## 4. Spike de *path aliases* (bloque 1)

Se hizo en un proyecto temporal **fuera del repositorio** (directorio de trabajo temporal, con un *junction* a `node_modules` que se eliminó sin recursión al terminar), con el mismo `tsconfig` de SQAF y `"paths": { "@sqaf/*": ["./src/*"] }` sin `baseUrl`:

| Prueba | Resultado |
|---|---|
| `tsc --noEmit` con un error de tipos intencional en un import por alias | `TS2322 Type 'number' is not assignable to type 'string'`, exit 1. El tipo se resolvió a través del alias |
| `tsc --noEmit` sin ese archivo | exit 0 (TypeScript 7.0.2) |
| `playwright test` con una prueba que importa por alias | `1 passed`, exit 0 (Playwright 1.65.0) |

No hubo inconsistencias, así que el alias se adoptó (resultado registrado en ADR-0004).

## 5. Inspección del DOM del SUT

Antes de definir los selectores, se inspeccionó el DOM real con un script de un solo uso: Chromium con bloqueo de anuncios, una visita a `/`, `/login`, `/products`, `/product_details/1`, la búsqueda "Jeans", un producto añadido al carrito, `/view_cart` y el primer paso del registro. **Ninguna cuenta se creó**: el formulario "Enter Account Information" no se envió. Hallazgos:

| Hallazgo | Consecuencia |
|---|---|
| Los formularios de login y alta exponen `data-qa` y no tienen labels (solo placeholders) | `getByTestId()` |
| En "Enter Account Information", el label "Zipcode" tiene `for="city"`. Los radios Mr./Mrs. y los dos checkboxes sí tienen labels correctos | `data-qa` para los campos de texto; rol y nombre accesible para radios y checkboxes |
| "Add to cart" es un `<a>` sin `href` (sin rol `link`) y está duplicado en `.product-overlay` | `.productinfo` + `getByText('Add to cart')` |
| `#submit_search` solo tiene un icono, sin nombre accesible ni `data-qa` | `#submit_search`, justificado |
| La búsqueda recarga `/products?search=<término>` con el encabezado "Searched Products" | `search()` espera esa URL y vuelve a llamar a `waitUntilReady()` |
| `#empty_cart` ("Cart is empty!") está oculto mientras hay productos | Permite verificar el aislamiento del carrito |
| El modal `#cartModal` no tiene `role="dialog"` | Raíz `#cartModal` |

**Hallazgo durante la primera ejecución de integración.** Con `getByRole('link', { name: 'Home', exact: true })`, 4 de 19 pruebas fallaron por timeout. El *snapshot* de accesibilidad mostró que el nombre accesible incluye el glifo de la fuente de iconos (un carácter de uso privado, un espacio y luego `Home`). Se cambió a patrones anclados (`/^\W*Home$/`), que solo admiten caracteres no alfanuméricos antes del texto visible, en el header y en "View Product". En la ejecución siguiente pasaron 19/19. Es un defecto del diseño de los localizadores, detectado y corregido antes de cualquier commit, y no del SUT ni de la infraestructura.

## 6. Resultados de las pruebas

### 6.1 Typecheck

`npm run typecheck` (`tsc --noEmit`) da **exit 0** con todo el código de E2.

### 6.2 Pruebas unitarias (`npm run test:unit`)

**82 passed** en local (5.3 s): las **66 de E1 siguen pasando** y hay 16 nuevas.

| Archivo nuevo | Pruebas | Qué verifica |
|---|---|---|
| `tests/unit/config/sqaf-projects-contract.spec.ts` | 4 | Política `data-qa` inmutable. Los proyectos `integration`, `chromium`, `firefox` y `webkit` resuelven (`--list`, sin navegador) la configuración de E1 más `testIdAttribute`, en local y en CI; `baseline` no la recibe; `integration` no declara retries ni workers propios |
| `tests/unit/architecture/dependency-rule.spec.ts` | 7 | Regla de dependencias sobre el repositorio real, cobertura de todas las capas existentes, suites sin localizadores crudos, y 4 autopruebas del analizador con archivos sintéticos (violaciones hacia arriba, entre hermanas y de suite a página; `import type` multilínea; comentarios, strings y paquetes externos; alias e `index.ts`; imports no resolubles) |
| `tests/unit/ci/workflow-steps.spec.ts` | 5 | Orden typecheck → unitarias → línea base → integración, evidencias de la línea base subidas antes de la integración, paso de la línea base sin opciones nuevas, salidas separadas de la integración y solo Chromium |

### 6.3 Pruebas de integración (`npm run test:integration`)

Corrida local completa con el código final: **20 passed, 0 failed, 0 flaky** (15.9 s, 4 workers en local, `fullyParallel`).

| Archivo | Pruebas | SUT | Resultado |
|---|---|---|---|
| `fixtures/fixtures.spec.ts` | 6 | No | Las 8 fixtures existen y son de la clase correcta; todas comparten el `page` del test; las 4 páginas de flujo rechazan `open()`; el bloqueo de anuncios es automático (`ERR_BLOCKED_BY_CLIENT`); aislamiento A/B (contexto sin cookies y una sola página, en cualquier orden) |
| `fixtures/anti-bot.spec.ts` | 3 | No (`page.route` intercepta todas las peticiones) | `open()` y `waitUntilReady()` lanzan `InfrastructureError` con `category: infrastructure`, `classification: infrastructure/anti-bot-challenge` y el marcador `[SQAF:...]`. Una página que no es un desafío falla como `toHaveTitle`, sin clasificación |
| `pages/base-page.spec.ts` | 1 | No | `waitUntilReady()` no termina hasta que se libera el recurso que retiene el evento `load` (sin esperas fijas). Repetida 3 veces: 3 passed |
| `pages/auth.spec.ts` | 3 | Sí | Formularios de login y alta disponibles; login inválido muestra "Your email or password is incorrect!"; formulario de registro rellenado (incluidos City y Zipcode por separado) **sin enviarlo** |
| `pages/products.spec.ts` | 5 | Sí | Listado con `ProductCard`; `ProductCard` reutilizada para "Blue Top" y "Men Tshirt"; detalle del producto; búsqueda "Jeans" (todos los resultados contienen el término); header reutilizado en 4 páginas para navegar Home → Products → Cart → Signup / Login → Home |
| `pages/cart.spec.ts` | 2 | Sí | Dos productos añadidos desde la rejilla (modal → Continue Shopping → View Cart) y representados en el carrito con precio, cantidad y total; un test nuevo empieza con el carrito vacío |

### 6.4 Mutaciones controladas

Cada mutación se aplicó y se revirtió con un script (sin commits). Al terminar, `git diff` coincidía con el estado anterior.

| # | Mutación | Pruebas ejecutadas | Fallidas |
|---|---|---|---|
| M1 | `BasePage` sin `waitForLoadState('load')` | Integración offline | 1 |
| M2 | Guard anti-bot después de `assertReady()` | Integración offline | 2 |
| M3 | Guard anti-bot eliminado | Integración offline | 2 |
| M4 | La fixture no aplica `blockAds` | Integración offline | 1 |
| M5 | `cartPage` sobre otra página | Integración offline | 1 |
| M6 | `src/utils` importa `src/errors` (`import type`) | Arquitectura | 1 |
| M7 | Una suite importa `@sqaf/pages` | Arquitectura | 1 |
| M8 | `testIdAttribute` añadido a `baseline` | Contratos de configuración | 5 |
| M9 | `testIdAttribute` eliminado de `sqafUse` | Contratos de configuración | 2 |

Las 9 mutaciones se detectaron.

## 7. Versión del paquete frente a tags

`package.json` y `package-lock.json` siguen en `"version": "0.1.0"`, mientras que los tags del repositorio son `v0.1.0` (E0) y `v0.2.0` (E1). Es intencional:

- El paquete es privado (`"private": true`) y nunca se publica.
- Cambiar `version` también reescribiría `package-lock.json`, que es un archivo protegido.

**Los tags identifican cada etapa.** Documentado en el README (sección *Versioning*).

## 8. Regresión de E0 (bloque 9)

Tres corridas locales con el comando de E0 (`npx playwright test --project=baseline --workers=1 --reporter=json`), con `CI`, `SQAF_ENV` y `SQAF_BASE_URL` vacías:

| Corrida | Inicio (UTC) | Duración | Resultado | Reintentos |
|---|---|---|---|---|
| `run-01.json` | 19:51:40 | 32.0 s | 5/5 | 0 |
| `run-02.json` | 19:52:13 | 34.8 s | 5/5 | 0 |
| `run-03.json` | 19:52:49 | 30.1 s | 5/5 | 0 |

- Los cinco escenarios pasaron al primer intento en las tres corridas.
- Las evidencias saneadas están en [`metrics/verification/E2-baseline-check/`](../../metrics/verification/E2-baseline-check/), separadas de los datos experimentales. Los archivos de E0 y E1 no se modificaron.
- La configuración efectiva de `baseline` sigue protegida por su prueba de contrato (sin cambios, en verde) y por la mutación M8.

No hubo desafío anti-bot en ninguna ejecución local de E2.

## 9. Integración continua

**Run [`43755588344`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43755588344)** (evento `pull_request` del PR [#5](https://github.com/lisethportuguez/sqaf-playwright/pull/5), commit `801bf20`), job `Typecheck, unit, baseline and integration (Chromium)`: **success**.

| Paso | Resultado |
|---|---|
| Typecheck | success |
| Unit tests (framework) | **82 passed** (8.5 s, 1 worker) |
| Install Chromium | success (solo Chromium) |
| Run baseline | **5 passed** (10.4 s, 1 worker, retries 0) |
| Upload HTML report | `playwright-report-43755588344-1` (224 486 bytes) |
| Upload failure evidence | skipped (sin fallos) |
| Integration tests (Page Objects and fixtures) | **20 passed**, 0 flaky (23.2 s, 1 worker) |
| Upload integration HTML report | `integration-report-43755588344-1` (239 028 bytes) |
| Upload integration failure evidence | skipped (sin fallos) |

- El reporter de clasificación informó "no failed attempts" en las tres ejecuciones (unitarias, línea base e integración).
- No hubo desafío anti-bot.
- El orden real de los pasos coincide con el fijado por `workflow-steps.spec.ts`.
- El contenido de `GITHUB_STEP_SUMMARY` (encabezados por paso) no se puede leer por la API. Su revisión visual en la pestaña *Actions* del run queda pendiente para la responsable.
- Los artifacts `failure-evidence-*` e `integration-failure-evidence-*` no se han generado todavía porque no ha habido fallos.
- El commit que añade esta sección solo modifica documentación. Como en `pull_request` GitHub evalúa el diff completo del PR, se espera que dispare otro run de CI del PR.

## 10. Desviaciones respecto al plan

| Desviación | Justificación |
|---|---|
| Archivo extra `tests/integration/pages/base-page.spec.ts` | Sin una prueba determinista, la mutación "quitar la espera a `load`" no se detectaba: la carrera con jQuery no se reproduce siempre contra el SUT. Es una prueba offline |
| Archivo extra `tests/unit/support/dependency-graph.ts` | El analizador de imports se separó de la prueba para poder autoprobarlo con archivos sintéticos |
| Archivos extra `config/locators.ts`, `tests/unit/config/sqaf-projects-contract.spec.ts` y `tests/unit/ci/workflow-steps.spec.ts` | D4 se centraliza en la capa de configuración (ADR-0005) y su contrato y el orden de CI se verifican con pruebas |
| `BasePage.navigateTo()` protegida y `path: string \| undefined` | `ProductDetailsPage` necesita una ruta con parámetro, y tres páginas solo se alcanzan por flujo. `AccountDeletedPage` **no** debe abrirse, porque un GET a su URL borra la cuenta de la sesión |
| `BasePage.page` es público (`readonly`) | Las pruebas necesitan comprobar que todas las fixtures comparten el `page` del test, y los tests usan aserciones de página (`toHaveURL`) |
| Localizadores con patrón anclado en lugar de `exact: true` | Glifo de icono en el nombre accesible (§5) |
| Nombre del job de CI cambiado | Refleja el pipeline real. `main` no tiene protección que dependa del nombre del check |
| Encabezados propios en `GITHUB_STEP_SUMMARY` y salidas separadas en CI | El reporter de E1 lista en su encabezado todos los proyectos configurados, no solo el ejecutado. Se resolvió desde el workflow, sin modificar el reporter de E1 |
| El paso de integración solo se ejecuta si la línea base pasa | Evita más peticiones al SUT cuando la línea base ya falló (por ejemplo, por el desafío anti-bot) |
| `.gitignore`: `test-results-integration/` y `playwright-report-integration/` | Salidas generadas por CI y local, nunca versionadas |
| Peticiones al SUT para inspeccionar el DOM (§5) | Requisito de no inventar selectores. Una sola sesión, sin crear cuentas |

## 11. Limitaciones y riesgos conocidos

| Tema | Situación |
|---|---|
| Elementos no ejercitados contra el SUT | `createAccount()`, `AccountCreatedPage`, `AccountDeletedPage`, `logout()`, `deleteAccount()` y `loggedInUser`. Requieren una sesión con cuenta: E3/E4 (D8). Los `data-qa` de las confirmaciones se observaron en E0; "Logout" proviene de los casos de prueba oficiales (TC4) |
| Desafío anti-bot real | El guard se validó con una simulación. No se ha producido un desafío real desde E1 |
| Más tráfico al SUT en CI | 9 de las 20 pruebas de integración contactan el SUT. Con 1 worker en CI y filtros de rutas, la exposición al desafío aumenta moderadamente |
| Retries de CI en `integration` | Hereda `retries: 2` en CI (decisión de E1, sin cambios). Un fallo intermitente aparecería como *flaky* en el reporte, no como un éxito silencioso |
| Encabezado del reporter de clasificación | Lista todos los proyectos configurados. Se mitiga con encabezados por paso. Se propone revisarlo en E5/E6 |
| Firefox y WebKit | Proyectos definidos con `data-qa`, sin tests hasta E4 |

## 12. Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Typecheck con exit 0 | Cumplido | §6.1 (local); §9 (CI) |
| 2 | Las 66 pruebas unitarias existentes siguen pasando | Cumplido | §6.2 y §9 (82 passed en local y en CI) |
| 3 | La nueva prueba de arquitectura pasa | Cumplido | §6.2 y §9; mutaciones M6 y M7 |
| 4 | Fixtures funcionales y tipadas | Cumplido (local) | §6.3 `fixtures.spec.ts`; typecheck |
| 5 | Páginas y componentes implementados | Cumplido | `src/pages/` (1 base, 3 componentes, 8 páginas) |
| 6 | Reutilización de `HeaderComponent` y `ProductCard` | Cumplido (local) | §6.3 `products.spec.ts` |
| 7 | Guard anti-bot con simulación | Cumplido (local) | §6.3 `anti-bot.spec.ts`; M2 y M3 |
| 8 | Las pruebas de integración pasan | Cumplido | §6.3 (20 passed en local); §9 (20 passed en CI) |
| 9 | `integration` usa `sqafUse` | Cumplido | Contrato `sqaf-projects-contract.spec.ts`; M9 |
| 10 | La línea base conserva exactamente su configuración | Cumplido | Contrato de E1 sin cambios y en verde; M8 |
| 11 | Los cuatro archivos protegidos conservan su SHA-256 | Cumplido | §2.2 |
| 12 | Tres corridas locales de E0 con 5/5 | Cumplido | §8 |
| 13 | CI ejecuta typecheck, unitarias, línea base e integración | Cumplido | §9 (run `43755588344`) |
| 14 | Sin dependencias nuevas ni cambios de versión | Cumplido | §2.2 (`package-lock.json` sin cambios) |
| 15 | Documentación y ADR actualizados | Cumplido | ADR-0007 (nuevo); ADR-0003, ADR-0004 y ADR-0005; `architecture.md`; README; este documento |
| 16 | PR de E2 abierto con checks en verde | Cumplido para `801bf20` (pendiente de confirmar el run del commit de documentación) | §9; PR [#5](https://github.com/lisethportuguez/sqaf-playwright/pull/5) |
