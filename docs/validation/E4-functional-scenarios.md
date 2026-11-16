# Etapa 4 — Validación de los escenarios funcionales

> Datos reales, sin editar. Rama `stage/4-functional-scenarios`, creada desde `main` (`1788078`). Decisiones: [ADR-0010](../architecture/decisions/ADR-0010-functional-scenarios.md).

- **Estado:** los 15 escenarios implementados (E4.1, E4.2, E4.3) y validados en local en Chromium; **E4.4 ejecutado en local**: 3 corridas completas, 50/54 tests aprobados, 0 fallos funcionales y 4 fallos de infraestructura (HTTP 503 del SUT). **Sin CI:** el workflow no se ha modificado ni ejecutado para E4 (ADR-0010 D9). **Sin publicar:** pendiente de revisión de la responsable del TFG.

## 1. E4.1 — Autenticación

### 1.1 Escenarios

| TC | Archivo | Fixtures de cuenta | Política de evidencias | Etiquetas |
|---|---|---|---|---|
| TC1 Register User | `tests/e2e/authentication/tc01-register-user.spec.ts` | `newUserData` (registro y borrado por la UI) | `CREDENTIAL_SAFE_EVIDENCE` | `@regression @account` |
| TC2 Login correcto | `tc02-login-user-correct.spec.ts` | `testUser` (borrado por la UI) | `CREDENTIAL_SAFE_EVIDENCE` | `@regression @smoke @account` |
| TC3 Login incorrecto | `tc03-login-user-incorrect.spec.ts` | — (DDT, 3 casos de `users/invalid-credentials.json`) | General de E1 | `@regression @smoke` |
| TC4 Logout | `tc04-logout-user.spec.ts` | `testUser` | `CREDENTIAL_SAFE_EVIDENCE` | `@regression @account` |
| TC5 E-mail existente | `tc05-register-user-existing-email.spec.ts` | `testUser` | `CREDENTIAL_SAFE_EVIDENCE` | `@regression @account` |

TC1 y TC3 llevan la anotación `sqaf-baseline-pair`.

### 1.2 Componentes

| Tipo | Componentes |
|---|---|
| Reutilizados sin cambios | `HomePage`, `HeaderComponent` (`goToSignupLogin`, `logout`, `deleteAccount`, `loggedInUser`), `SignupLoginPage` (`login` con `fillSecret`, `startSignup`, `loginError`), `AccountInformationPage`, `AccountCreatedPage`, `AccountDeletedPage`, `testUser`, `newUserData`, `accountApi`, `credentialGuard`, `testData.invalidCredentials`, `caseTitle`, `credentialsOf`, `CREDENTIAL_SAFE_EVIDENCE`, reporter de clasificación y evidencia HTTP |
| Nuevos | `src/fixtures/scenarios.ts` (catálogo), `src/fixtures/flows.fixture.ts` (`userFlows.registerViaUi`), `SignupLoginPage.signupError`, `cleanUpAccount` en `data.fixture.ts` |
| Modificados | `src/fixtures/data.fixture.ts` (limpieza verificada compartida), `src/fixtures/index.ts` (`flowsTest` en `mergeTests`, exportaciones), `src/pages/signup-login.page.ts`, `package.json` (script `test:e2e`), `.gitignore` (`test-results-e2e/`, `playwright-report-e2e/`) |

`payOrder(card)` (ADR-0010 D5) se añadirá en E4.3 junto con los Page Objects de checkout que necesita.

### 1.3 Pruebas sin SUT

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run test:unit` | **272 passed** (257 previas + 9 del contrato de trazabilidad + 6 de limpieza de cuentas) |
| Contrato de arquitectura (`dependency-rule.spec.ts`) | Pasa: las suites de `tests/e2e` solo importan `@sqaf/fixtures` y no usan localizadores |
| Contrato de credenciales (`credential-evidence.spec.ts`) | Pasa: los 4 archivos con cuentas declaran la política; TC3 conserva la general |
| Mutaciones del contrato de trazabilidad (revertidas) | Archivo renombrado a `tc4-…` → 1 fallo; TC2 con `scenario('TC3')` → 3 fallos; TC5 eliminado → 1 fallo (bloque E4.1 incompleto) |

### 1.4 Ejecución contra el SUT

Una sola ejecución, local, Chromium, `--workers=2`, 2026-11-16 05:41 UTC:

```
PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report-e2e PLAYWRIGHT_JSON_OUTPUT_FILE=reports/e2e-results.json \
npx playwright test --project=chromium --workers=2 --output=test-results-e2e \
  --reporter=list,json,html,./src/reporting/failure-classification-reporter.ts
```

**7 passed (39,1 s)**, 0 fallos, 0 flaky, 0 reintentos. Clasificación: sin intentos fallidos.

| Test | Estado | Duración (s) |
|---|---|---|
| TC1 | passed | 20,3 |
| TC2 | passed | 14,2 |
| TC3 [unregistered-email] | passed | 4,9 |
| TC3 [unregistered-plus-address] | passed | 5,9 |
| TC3 [invalid-domain] | passed | 6,0 |
| TC4 | passed | 12,6 |
| TC5 | passed | 6,8 |

### 1.5 Cuentas

4 cuentas creadas (1 por TC1, TC2, TC4 y TC5), ninguna fuera de esta ejecución.

> Los `dataId` reales se sustituyeron por seudónimos estables (`cuenta-NN`) antes de publicar E4 (§5.11).

| Fixture | `dataId` | Borrado de la fixture | `verifiedAbsent` |
|---|---|---|---|
| `newUserData` (TC1) | `cuenta-01` | `not-found` (ya borrada por la UI) | `true` |
| `testUser` (TC2) | `cuenta-02` | `not-found` (ya borrada por la UI) | `true` |
| `testUser` | `cuenta-03` | `deleted` | `true` |
| `testUser` | `cuenta-04` | `deleted` | `true` |

Verificación independiente posterior (API 14, solo lectura, sin imprimir e-mails): las 4 cuentas responden `responseCode 404`.

### 1.6 Escaneo de evidencias

Se recorrieron `playwright-report-e2e/` (incluido el zip embebido en `index.html`), `test-results-e2e/` y `reports/`: 10 entradas. **0 contraseñas generadas** (`Sqaf#…`) y **0 pares `password=`/`"password":`** sin redactar. 0 trazas y 0 vídeos (no hubo fallos).

### 1.7 Integridad

SHA-256 sin cambios: `baseline/baseline.spec.ts` (`ebf863f5…`), `config/evidence.ts` (`c270915e…`), `playwright.config.ts` (`072584ae…`), `config/ad-blocking.ts` (`0669a541…`), `package-lock.json` (`f77c95b8…`), `metrics/experiments/E0-baseline/summary.json` (`963781da…`). No se tocaron `ci.yml` ni las evidencias de E0 y E1.

### 1.8 Riesgos

- TC1 usa 20,3 s de los 30 s del timeout de test en local; en CI puede acercarse más al límite.
- Una sola ejecución: no permite conclusiones de estabilidad (serie de medición en E4.4).
- Si un run se cancela a mitad de un test con cuenta, el teardown puede no ejecutarse (ADR-0010, riesgos).

## 2. E4.2 — Productos

### 2.1 Escenarios

Ninguno usa fixtures de cuenta: todos mantienen la política general de evidencias de E1.

| TC | Archivo (`tests/e2e/products/`) | Datos | Etiquetas | Par de la línea base |
|---|---|---|---|---|
| TC8 | `tc08-verify-all-products-and-detail.spec.ts` | `catalog` (producto 1) | `@regression @smoke` | Sí |
| TC9 | `tc09-search-product.spec.ts` | DDT: 2 casos de `search-terms` | `@regression @smoke` | Sí (`[jeans]`) |
| TC12 | `tc12-add-products-in-cart.spec.ts` | `catalog` (productos 1 y 2), `cartLine` | `@regression @smoke` | Sí |
| TC13 | `tc13-verify-product-quantity-in-cart.spec.ts` | `catalog` (producto 3), cantidad 4 | `@regression` | |
| TC17 | `tc17-remove-products-from-cart.spec.ts` | `catalog` (productos 1 y 2) | `@regression` | |
| TC18 | `tc18-view-category-products.spec.ts` | `categories` (`women-dress`, `men-tshirts`) | `@regression` | |

### 2.2 Componentes

| Tipo | Componentes |
|---|---|
| Reutilizados | `BasePage`, `HeaderComponent`, `ProductCard`, `CartModal`, `ProductsPage.search`, `ProductDetailsPage`, `CartPage.itemNamed`, `testData.products`, `testData.productSearches`, `cartLine`, `cartLineTexts`, `caseTitle`, reporter, clasificación y evidencia HTTP |
| Nuevos | `ProductGrid`, `CategorySidebar`, `CategoryProductsPage` (con su fixture `categoryProductsPage`), `CartModal.of`, dataset `products/categories.json` (tipo `ProductCategory`, esquema, provider `testData.productCategories`) |
| Modificados | `HomePage` (rejilla, modal y sidebar), `ProductsPage` (delega en `ProductGrid`, misma API), `ProductDetailsPage` (cantidad y "Add to cart"), `CartPage` (`removeButton`, `removeItem`), `pages.fixture.ts`, `src/fixtures/index.ts` (exporta `formatPrice` y los tipos de categoría), `src/data` (tipo, esquema, dataset y provider) |

### 2.3 Pruebas sin SUT

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run test:unit` | **280 passed** (272 + 8 del dataset de categorías: esquema, provider, coherencia con el catálogo y los términos de búsqueda, y compatibilidad de tipos con el Page Object) |
| Contratos de arquitectura, trazabilidad (bloques E4.1 y E4.2 completos) y credenciales | Pasan |
| `tests/integration/pages/product-components.spec.ts` (offline: `page.route` sirve una copia reducida del markup del SUT) | **4 passed**: `ProductGrid` excluye el carrusel, `CategorySidebar` acota "Dress" a su sección, `addToCart(4)` envía `quantity=4` y `removeItem` espera a que desaparezca la fila y muestra el carrito vacío |
| Mutación (revertida): botón "Add to cart" con nombre exacto en lugar del patrón anclado | La prueba offline falla: el glifo forma parte del nombre accesible |

Durante el desarrollo, las pruebas offline detectaron dos defectos antes de cualquier ejecución contra el SUT: un filtro `has` construido desde la raíz del sidebar (no encontraba nada) y tres barras invertidas perdidas en expresiones regulares.

### 2.4 Ejecución contra el SUT

Una sola ejecución, local, Chromium, **1 worker**, 2026-11-16 06:01 UTC (`npx playwright test tests/e2e/products --project=chromium --workers=1`, con los mismos reporters que E4.1):

**7 passed (49,5 s)**, 0 fallos, 0 flaky, 0 reintentos. Clasificación: sin intentos fallidos.

| Test | Estado | Duración (s) |
|---|---|---|
| TC8 | passed | 14,1 (primer test: incluye el arranque del navegador) |
| TC9 [jeans] | passed | 6,7 |
| TC9 [saree] | passed | 6,4 |
| TC12 | passed | 5,9 |
| TC13 | passed | 5,6 |
| TC17 | passed | 6,1 |
| TC18 | passed | 4,1 |

### 2.5 Cuentas

**0 cuentas creadas.** Ningún archivo de `tests/e2e/products` usa `testUser`, `newUserData` ni `accountApi`; el informe JSON no tiene anotaciones `sqaf-test-data` ni adjuntos `sqaf-account-cleanup`.

### 2.6 Escaneo de evidencias

`playwright-report-e2e/` (incluido el zip embebido), `test-results-e2e/` y `reports/`: 11 entradas, **0 contraseñas generadas y 0 pares de contraseña**. 0 trazas y 0 vídeos (no hubo fallos).

### 2.7 Integridad

Sin cambios en E0 (`baseline/`, evidencias), `config/`, `playwright.config.ts`, `package-lock.json`, `ci.yml` ni en los escenarios de E4.1. Las pruebas de integración de E2 contra el SUT no se volvieron a ejecutar para no repetir llamadas: el refactor de `ProductsPage` conserva su API, que TC9 y TC12 ejercitan contra el SUT.

### 2.8 Riesgos

- Los datos esperados (catálogo y categorías) son una instantánea del 2026-11-16: si el SUT cambia su catálogo, TC8, TC13 y TC18 fallarán como `assertion/mismatch`.
- Una sola ejecución: sin conclusiones de estabilidad (E4.4).

## 3. E4.3 — Carrito y checkout

### 3.1 Escenarios

Todos usan cuenta y declaran `CREDENTIAL_SAFE_EVIDENCE`. Timeout específico de 60 s (ADR-0010 D11); el global sigue en 30 s.

| TC | Archivo (`tests/e2e/checkout/`) | Cuenta | Etiquetas |
|---|---|---|---|
| TC14 | `tc14-place-order-register-while-checkout.spec.ts` | `newUserData` (registro durante el checkout, borrado por la UI) | `@regression @account` |
| TC15 | `tc15-place-order-register-before-checkout.spec.ts` | `newUserData` (registro antes del checkout, borrado por la UI) | `@regression @account` |
| TC16 | `tc16-place-order-login-before-checkout.spec.ts` | `testUser` (login por la UI, borrado por la UI) | `@regression @smoke @account` |
| TC23 | `tc23-verify-address-details-in-checkout.spec.ts` | `newUserData` (registro, borrado por la UI; sin pago) | `@regression @account` |

Datos: productos 1 y 2 de `catalog`, tarjeta ficticia `test-visa` de `checkout/payment-cards.json`, perfil `default` de `account-profiles` y un comentario de pedido fijo sin datos personales.

### 3.2 Componentes

| Tipo | Componentes |
|---|---|
| Reutilizados | `BasePage`, `HomePage` (rejilla y modal), `HeaderComponent`, `CartPage`, `CartModal`, `SignupLoginPage`, `AccountInformationPage`, `AccountCreatedPage`, `AccountDeletedPage`, `userFlows.registerViaUi`, `testUser`, `newUserData`, `credentialsOf`, `cartLine`, `cartLineTexts`, `cartTotal`, `formatPrice`, `fillSecret`, reporter, clasificación y evidencia HTTP |
| Nuevos | `CartTable`, `CheckoutModal`, `AddressBlock`, `CheckoutPage`, `PaymentPage` (`PaymentDetails`), `OrderPlacedPage`, sus fixtures, `userFlows.payOrder`, `expectedAddressLines`, `CHECKOUT_TIMEOUT` y el campo `timeout` del catálogo |
| Modificados | `CartPage` (delega en `CartTable`, misma API; `proceedToCheckout`, `checkoutModal`), `flows.fixture.ts`, `pages.fixture.ts`, `scenarios.ts`, `src/fixtures/index.ts`, `src/pages/index.ts`, `src/data/index.ts` y el contrato de trazabilidad (bloque E4.3 entregado, regla de timeouts) |

### 3.3 Pruebas sin SUT

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run test:unit` | **285 passed** (280 + 4 de `expectedAddressLines` + 1 del contrato de timeouts) |
| Contratos de arquitectura, trazabilidad (los 3 bloques completos) y credenciales | Pasan |
| `tests/integration/pages/checkout-components.spec.ts` (offline, plantillas del SUT con `page.route`) | **3 passed**: modal sin usuario y enlace a login; `CheckoutPage` con direcciones, filas sin la de total y total; `payOrder` envía todos los campos de la tarjeta y termina en "Order Placed!" |
| `product-components.spec.ts` (E4.2, tras el refactor de `CartPage`) | 4 passed |
| Mutación (revertida): `AddressBlock` sin excluir el encabezado | La prueba offline falla (8 líneas en lugar de 7) |

### 3.4 Ejecución contra el SUT

Local, Chromium, **1 worker**, con los mismos reporters que E4.1.

**Ejecución 1** (2026-11-16 06:15 UTC, los 4 escenarios): 2 passed, 2 failed (61,1 s).

| Test | Estado | Duración (s) | Clasificación |
|---|---|---|---|
| TC14 | passed | 26,2 | |
| TC15 | passed | 19,8 | |
| TC16 | failed | 1,6 | `infrastructure/sut-unavailable`: la API respondió con error de servidor al crear la cuenta de `testUser` (antes del escenario) |
| TC23 | failed | 12,3 | `infrastructure/sut-unavailable`: `main document (POST) answered HTTP 503` en el envío del registro |

Ambos fallos son del SUT y ocurrieron antes de llegar a los componentes de checkout, que quedaron sin validar. Por eso se repitieron **una sola vez y solo esos dos escenarios**.

**Ejecución 2** (2026-11-16 06:17 UTC, TC16 y TC23): **2 passed (39,0 s)**, 0 reintentos.

| Test | Estado | Duración (s) |
|---|---|---|
| TC16 | passed | 22,9 |
| TC23 | passed | 15,5 |

TC23 confirmó contra el SUT las 7 líneas de `expectedAddressLines` en las dos direcciones. Resultado de E4.3: **4 de 4 escenarios validados**; 2 fallos de infraestructura registrados y clasificados correctamente por la evidencia estructurada (ADR-0008 D14).

### 3.5 Cuentas

6 cuentas en total (4 en la ejecución 1 y 2 en la ejecución 2). Todas eliminadas:

> Los `dataId` reales se sustituyeron por seudónimos estables (`cuenta-NN`) antes de publicar E4 (§5.11).

| Ejecución | TC | Fixture | `dataId` | Borrado de la fixture | `verifiedAbsent` | API 14 posterior |
|---|---|---|---|---|---|---|
| 1 | TC14 | `newUserData` | `cuenta-05` | `not-found` (borrada por la UI) | `true` | 404 |
| 1 | TC15 | `newUserData` | `cuenta-06` | `not-found` (borrada por la UI) | `true` | 404 |
| 1 | TC16 | `testUser` | `cuenta-07` | Alta fallida (503): la fixture intentó borrarla y relanzó el error; sin registro de limpieza | — | 404 |
| 1 | TC23 | `newUserData` | `cuenta-08` | `not-found` (el registro falló con 503) | `true` | 404 |
| 2 | TC16 | `testUser` | `cuenta-09` | `not-found` (borrada por la UI) | `true` | 404 |
| 2 | TC23 | `newUserData` | `cuenta-10` | `not-found` (borrada por la UI) | `true` | 404 |

La verificación posterior (API 14, solo lectura, sin imprimir e-mails) cubrió también la cuenta de TC16 cuya alta falló, que no tiene registro de limpieza.

### 3.6 Escaneo de evidencias

- **Ejecución 1** (15 entradas, con capturas y `error-context` de los fallos): 0 contraseñas generadas. El patrón genérico `password:` detectó 3 coincidencias, todas el mismo fragmento de **código fuente** (`password: credentials.password` de `src/api/account.client.ts`) que Playwright muestra en el marco de código del error de TC16. No es un valor: falso positivo.
- **Ejecución 2** (7 entradas): 0 contraseñas generadas, 0 pares de contraseña y 0 apariciones del número de la tarjeta ficticia (escrito con `fillSecret`).
- 0 trazas y 0 vídeos en ambas.

### 3.7 Integridad

SHA-256 sin cambios de `baseline/baseline.spec.ts`, `config/evidence.ts`, `playwright.config.ts`, `config/ad-blocking.ts`, `package-lock.json` y el `summary.json` de E0. Sin cambios en `ci.yml` ni en los escenarios de E4.1 y E4.2.

### 3.8 Riesgos

- El SUT respondió 503 en 2 de 4 escenarios de la primera ejecución: es la causa de inestabilidad más probable para E4.4 y para CI.
- El alta por API de `testUser` que falla con 503 no deja registro de limpieza: se verificó a mano. Si el SUT guardara la cuenta pese al 503, el borrado de la fixture lo cubre.
- Los pedidos quedan asociados a cuentas que se eliminan; el SUT no cobra.

## 4. E4.4 — Validación integral y medición

> Resultados de **validación local**. No hay resultados de CI de E4: el workflow no se ha modificado ni ejecutado para esta etapa. Datos extraídos en [`metrics/experiments/E4-sqaf/summary.json`](../../metrics/experiments/E4-sqaf/summary.json).

### 4.1 Condiciones

| Variable | Valor |
|---|---|
| Entorno | Local, Windows 11, Node.js v26.13.1, Playwright 1.65.0 |
| Comando | `npx playwright test --project=chromium --workers=1 --retries=0` con los reporters list, JSON, HTML y de clasificación |
| Suite | 15 escenarios = 18 tests (TC3 con 3 casos y TC9 con 2) |
| Workers / reintentos | 1 / 0 |
| Timeouts | Test 30 s; escenarios de checkout 60 s (ADR-0010 D11); sin cambios |
| Código | Rama `stage/4-functional-scenarios` sobre `1788078`, cambios sin commit; huella `da5083ed297fa675` (sin cambios entre corridas) |
| Datos y configuración | Los existentes, sin modificar. Ningún escenario se modificó en E4.4 |

### 4.2 Ejecuciones

| ID | Inicio (UTC) | Duración (s) | Tests | Aprobados | Fallidos | Reintentos | Inestables | Fallos y clasificación |
|---|---|---|---|---|---|---|---|---|
| run-1 | 2026-11-16 06:26:41 | 197,7 | 18 | 17 | 1 | 0 | 0 | TC14: `infrastructure/sut-unavailable` (main document (POST) answered HTTP 503) |
| run-2 | 2026-11-16 06:30:14 | 211,7 | 18 | 17 | 1 | 0 | 0 | TC1: `infrastructure/sut-unavailable` (main document (POST) answered HTTP 503) |
| run-3 | 2026-11-16 06:33:54 | 196,8 | 18 | 16 | 2 | 0 | 0 | TC15: `infrastructure/sut-unavailable` (main document (POST) answered HTTP 503)<br>TC8: `infrastructure/sut-unavailable` (main document (GET) answered HTTP 503) |

Duración total media: **202,1 s** (mín. 196,8 s, máx. 211,7 s). No se hizo ninguna repetición diagnóstica: los 4 fallos tienen evidencia estructurada suficiente (estado HTTP del documento principal) y los mismos escenarios pasaron en las otras corridas.

### 4.3 Resultados por test

Duraciones en segundos; ✗ = intento fallido (su duración no entra en la media).

| Test | run-1 | run-2 | run-3 | Aprobados | Fallos infra./SUT | Fallos funcionales | Media aprobados | Rango aprobados |
|---|---|---|---|---|---|---|---|---|
| TC1 | 18,6 | 13,9 ✗ | 14,1 | 2/3 | 1 | 0 | 16,4 | 14,1–18,6 |
| TC2 | 9,7 | 13,1 | 8,8 | 3/3 | 0 | 0 | 10,5 | 8,8–13,1 |
| TC3 [unregistered-email] | 5,0 | 5,7 | 4,7 | 3/3 | 0 | 0 | 5,1 | 4,7–5,7 |
| TC3 [unregistered-plus-address] | 4,7 | 5,9 | 5,4 | 3/3 | 0 | 0 | 5,3 | 4,7–5,9 |
| TC3 [invalid-domain] | 5,1 | 5,4 | 3,5 | 3/3 | 0 | 0 | 4,7 | 3,5–5,4 |
| TC4 | 10,6 | 13,9 | 11,2 | 3/3 | 0 | 0 | 11,9 | 10,6–13,9 |
| TC5 | 5,7 | 6,6 | 8,8 | 3/3 | 0 | 0 | 7,0 | 5,7–8,8 |
| TC14 | 19,1 ✗ | 23,6 | 26,1 | 2/3 | 1 | 0 | 24,9 | 23,6–26,1 |
| TC15 | 21,5 | 27,8 | 24,8 ✗ | 2/3 | 1 | 0 | 24,6 | 21,5–27,8 |
| TC16 | 17,9 | 18,4 | 20,7 | 3/3 | 0 | 0 | 19,0 | 17,9–20,7 |
| TC23 | 21,8 | 20,9 | 18,1 | 3/3 | 0 | 0 | 20,2 | 18,1–21,8 |
| TC8 | 6,3 | 7,8 | 8,7 ✗ | 2/3 | 1 | 0 | 7,1 | 6,3–7,8 |
| TC9 [jeans] | 5,7 | 7,4 | 10,0 | 3/3 | 0 | 0 | 7,7 | 5,7–10,0 |
| TC9 [saree] | 7,9 | 6,4 | 8,6 | 3/3 | 0 | 0 | 7,6 | 6,4–8,6 |
| TC12 | 9,8 | 10,2 | 6,5 | 3/3 | 0 | 0 | 8,8 | 6,5–10,2 |
| TC13 | 9,6 | 6,6 | 5,0 | 3/3 | 0 | 0 | 7,1 | 5,0–9,6 |
| TC17 | 9,4 | 7,0 | 4,4 | 3/3 | 0 | 0 | 7,0 | 4,4–9,4 |
| TC18 | 7,2 | 9,0 | 4,7 | 3/3 | 0 | 0 | 7,0 | 4,7–9,0 |

### 4.4 Indicadores agregados

| Indicador | Valor | Cálculo |
|---|---|---|
| Tasa de aprobación observada | **92,6 %** (50/54) | Tests aprobados / tests ejecutados en las 3 corridas |
| Tasa de fallos de infraestructura/SUT | **7,4 %** (4/54) | Fallos con clasificación `infrastructure/*` / tests ejecutados |
| Fallos funcionales | **0** (0,0 %) | Fallos sin clasificación de infraestructura |
| Reintentos / inestables | 0 / 0 | Con `--retries=0` no puede haber resultados *flaky* |
| Escenarios aprobados por corrida | 41/45 | Un escenario aprueba una corrida si aprueban todos sus casos |
| Estabilidad entre corridas | 11 de 15 escenarios aprobaron las 3 corridas; TC1, TC14, TC15, TC8 fallaron una vez, siempre por HTTP 503 | Escenarios con resultado idéntico en las 3 corridas |
| Aprobación excluyendo infraestructura | 100,0 % (50/50) | Aprobados / (ejecutados − fallos de infraestructura). **No es la tasa observada:** solo indica que ninguna ejecución no afectada por el SUT falló. Los 4 fallos se mantienen en todas las demás cifras |

Los 4 fallos son `infrastructure/sut-unavailable` con la evidencia `main document (<método>) answered HTTP 503` (ADR-0008 D14): 3 en un POST (registro en TC1 y TC14, pago en TC15) y 1 en un GET (página de productos en TC8). No se cuentan como defectos funcionales del framework, pero tampoco se eliminan de la tasa observada.

### 4.5 Cuentas

| Corrida | Instancias de fixture de cuenta | Borradas por la fixture (`deleted`) | Ya ausentes (`not-found`) | `verifiedAbsent` automático | Ausencia verificada a mano (API 14) |
|---|---|---|---|---|---|
| run-1 | 8 | 2 | 6 | 8 | 8 |
| run-2 | 8 | 2 | 6 | 8 | 8 |
| run-3 | 8 | 3 | 5 | 8 | 8 |
| **Total** | **24** | **7** | **17** | **24** | **24** |

- **Cuentas activas al terminar: 0.**
- `not-found` significa que el escenario la borró por la UI (paso oficial) o que nunca llegó a crearse: TC14 (run-1) y TC1 (run-2) fallaron con 503 en el POST del registro.
- TC15 (run-3) falló en el pago con la cuenta ya creada: la fixture la borró (`deleted`) y verificó su ausencia.
- La verificación manual consultó la API 14 (solo lectura) para las 24 instancias después de las 3 corridas, sin imprimir e-mails.

### 4.6 Escaneo de secretos

| Corrida | Entradas analizadas | Contraseñas generadas | Número de tarjeta | Pares `password` | Trazas | Vídeos | Capturas de fallo |
|---|---|---|---|---|---|---|---|
| run-1 | 24 | 0 | 0 | 0 | 0 | 0 | 1 |
| run-2 | 24 | 0 | 0 | 0 | 0 | 0 | 1 |
| run-3 | 252 | 0 | 0 | 0 | 1 | 0 | 2 |

- Se analizó cada archivo de `playwright-report-e2e/` (incluido el zip embebido en `index.html`), `test-results-e2e/` y `reports/`, abriendo también los zip de traza.
- La única traza es la de **TC8** (run-3), suite sin cuentas con la política general (`retain-on-failure`): sus 252 entradas no contienen contraseñas ni el número de tarjeta.
- **TC15 falló con cuenta y sin traza ni vídeo:** la política `CREDENTIAL_SAFE_EVIDENCE` se comportó como se esperaba en un fallo real.
- 0 falsos positivos en E4.4: el falso positivo de E4.3 (fragmento de código fuente `password: credentials.password`) no se repitió, porque ningún fallo de E4.4 ocurrió dentro del cliente de la API.

### 4.7 Arquitectura y mantenibilidad

Métricas estáticas calculadas sobre el código (método en `summary.json`, `architecture.method`):

- **LOC:** líneas no vacías que no son comentarios.
- **Llamadas de selector:** apariciones de `.locator(`, `.getBy*(`, `.$(` y `.$$(`.
- **Literales CSS:** cadenas que empiezan por `#id`, `.clase` o `[data-qa=`.
- **Miembros de Page Object:** miembros distintos referenciados por el spec; los componentes (`header`, `productGrid`, `cartModal`…) cuentan una vez.

| TC | LOC | Llamadas de selector | Literales CSS | Miembros de Page Object | Flujos | Fixture de cuenta | Datasets |
|---|---|---|---|---|---|---|---|
| TC1 | 21 | 0 | 0 | 10 | registerViaUi | newUserData | — |
| TC2 | 23 | 0 | 0 | 10 | — | testUser | — |
| TC3 | 19 | 0 | 0 | 7 | — | — | invalidCredentials |
| TC4 | 24 | 0 | 0 | 9 | — | testUser | — |
| TC5 | 20 | 0 | 0 | 8 | — | testUser | — |
| TC14 | 77 | 0 | 0 | 23 | registerViaUi, payOrder | newUserData | products, paymentCards |
| TC15 | 65 | 0 | 0 | 22 | registerViaUi, payOrder | newUserData | products, paymentCards |
| TC16 | 72 | 0 | 0 | 25 | payOrder | testUser | products, paymentCards |
| TC23 | 48 | 0 | 0 | 19 | registerViaUi | newUserData | products |
| TC8 | 29 | 0 | 0 | 14 | — | — | products |
| TC9 | 24 | 0 | 0 | 8 | — | — | productSearches |
| TC12 | 40 | 0 | 0 | 12 | — | — | products |
| TC13 | 29 | 0 | 0 | 11 | — | — | products |
| TC17 | 32 | 0 | 0 | 11 | — | — | products |
| TC18 | 30 | 0 | 0 | 9 | — | — | productCategories |
| **Total** | **553** | **0** | **0** | 69 distintos | 5 specs | 8 specs | |

| Aspecto | Evidencia |
|---|---|
| Separación por capas | El contrato `dependency-rule.spec.ts` pasa: 0 violaciones; las 15 suites solo importan `@sqaf/fixtures`. Tamaño (archivos/LOC): pages 23/678, fixtures 7/425, data 10/550, api 2/232, errors 9/460, utils 8/207, reporting 1/170, suites e2e 15/553 |
| Selectores en los specs | **0** llamadas de selector y **0** literales CSS en los 15 specs (también comprobado por el contrato de arquitectura) |
| Reutilización de Page Objects | 36 de 69 miembros (52,2 %) los usan 2 o más escenarios. Los más usados: `homePage.open` (15), `header.goToSignupLogin` (8), `cartModal.confirmationMessage` (7), `cartPage.waitUntilReady` (7), `productGrid.productNamed` (7), `accountDeletedPage.confirmation` (6) |
| Fixtures y flujos | `registerViaUi` en 4 escenarios y `payOrder` en 3; `testUser` en 4 y `newUserData` en 4; las 8 suites con cuenta declaran `CREDENTIAL_SAFE_EVIDENCE` |
| Datos centralizados | 6 datasets JSON validados; ningún spec define productos, credenciales, perfiles ni tarjetas en línea (solo la cantidad oficial 4 de TC13 y el comentario del pedido) |
| Data-Driven Testing | TC3 (3 casos) y TC9 (2 casos): 5 de los 18 tests se generan desde datos |
| Utilidades comunes | `formatPrice`, `cartLine`, `cartLineTexts`, `cartTotal`, `caseTitle`, `credentialsOf` y `expectedAddressLines` |
| Manejo de errores | Los 4 fallos reales se clasificaron como `infrastructure/sut-unavailable` a partir del estado HTTP estructurado; 0 `unclassified` |
| Evidencias | Política por suite verificada en un fallo real (TC15 sin traza, TC8 con traza); escaneo limpio |
| Trazabilidad | 15/15 escenarios con título oficial, `sqaf-test-case`, etiquetas del catálogo y, en los 5 pares, `sqaf-baseline-pair`; contrato de trazabilidad en verde |

**Impacto de un cambio de selector representativo** (archivos a modificar):

| Cambio | SQAF: archivos | SQAF: specs | Escenarios SQAF que lo usan | E0: líneas de `baseline.spec.ts` |
|---|---|---|---|---|
| Enlace "Signup / Login" del header | 1 (`src/pages/components/header.component.ts`) | 0 | 8 | 2 |
| Campo de e-mail del login (`data-qa="login-email"`) | 1 (`src/pages/signup-login.page.ts`) | 0 | 4 | 1 |
| "Add to cart" de una tarjeta de producto | 1 (`src/pages/components/product-card.component.ts`) | 0 | 6 | 2 |
| Rejilla de productos (`.features_items .product-image-wrapper`) | 1 (`src/pages/components/product-grid.component.ts`) | 0 | 10 | 2 |
| Enlace "Delete Account" del header | 1 (`src/pages/components/header.component.ts`) | 0 | 6 | 1 |

En SQAF cada selector está definido una sola vez, en un Page Object o componente; ningún spec cambia. En E0 el selector se repite en cada test que lo usa (un único archivo, pero varias líneas). Con 5 escenarios la diferencia es pequeña; crece con el número de escenarios que comparten el control (hasta 10 en SQAF).

### 4.8 Comparación con E0

E0 serie oficial 2 (run-04 a run-06, 2026-11-15) frente al caso SQAF equivalente de las 3 corridas de E4.4. Duraciones SQAF solo de ejecuciones aprobadas; E0 sin cambios (solo se leyó `summary.json`).

| TC | Caso SQAF | E0 aprobados | E0 media (s) | SQAF aprobados | SQAF media (s) | Relación | E0 LOC | SQAF LOC (spec) | E0 llamadas de selector | SQAF llamadas de selector |
|---|---|---|---|---|---|---|---|---|---|---|
| TC1 | `TC1` | 3/3 | 6,9 | 2/3 (1 infra.) | 16,4 | 2,39× | 53 | 21 | 30 | 0 |
| TC3 | `TC3 [unregistered-email]` | 3/3 | 3,7 | 3/3 | 5,1 | 1,4× | 10 | 19 | 6 | 0 |
| TC8 | `TC8` | 3/3 | 3,6 | 2/3 (1 infra.) | 7,1 | 1,97× | 17 | 29 | 11 | 0 |
| TC9 | `TC9 [jeans]` | 3/3 | 4,4 | 3/3 | 7,7 | 1,74× | 16 | 24 | 6 | 0 |
| TC12 | `TC12` | 3/3 | 7,2 | 3/3 | 8,8 | 1,23× | 29 | 40 | 21 | 0 |

| Dimensión | E0 | SQAF (E4) |
|---|---|---|
| Duración | Más rápida por test | Entre 1,2× y 2,4× la duración de E0 en los 5 pares. No se puede atribuir a una sola causa con estos datos: SQAF espera el evento `load` y el guard anti-bot en cada página, hace aserciones más fuertes, TC1 vuelve a borrar y verificar la cuenta por API y es el primer test de cada corrida (arranque del navegador), y las mediciones son de días distintos con carga del SUT distinta |
| Estructura | Selectores y datos dentro de cada test (74 llamadas de selector en los 5 tests) | 0 selectores en los specs; datos en JSON validado |
| LOC del test | Menos líneas en TC3, TC8, TC9 y TC12; más en TC1 (53 frente a 21) | Más líneas por spec por los `test.step` de trazabilidad y las aserciones adicionales; el código reutilizable vive en las capas |
| Reutilización | Ninguna (código duplicado entre tests) | 52,2 % de los miembros de Page Object reutilizados |
| Evidencias | Ninguna en E0 (sin traza, captura ni vídeo) | Traza en fallo para suites sin cuentas; captura sin traza ni vídeo para suites con cuentas |
| Configuración | Condiciones fijas en el proyecto `baseline` | Capa de configuración y timeouts por catálogo |
| Resultados | Serie 2: 15/15 aprobados. Serie 1: invalidada por un defecto de automatización (carrera con jQuery) | 50/54 aprobados; 0 fallos funcionales; 4 fallos de infraestructura clasificados. La carrera con jQuery de E0 no puede ocurrir: `waitUntilReady()` espera `load` en cada navegación |

Esta comparación es **descriptiva**: no hay ejecuciones simultáneas ni condiciones idénticas. La comparación experimental controlada corresponde a la Etapa 7.

### 4.9 Integridad

SHA-256 sin cambios de `baseline/baseline.spec.ts`, `config/evidence.ts`, `playwright.config.ts`, `config/ad-blocking.ts`, `package-lock.json` y `metrics/experiments/E0-baseline/summary.json`. Sin cambios en `ci.yml`, en los escenarios ni en los Page Objects durante E4.4.

### 4.10 Limitaciones, riesgos y trabajo pendiente

- **Disponibilidad del SUT:** 4 de 54 ejecuciones (7,4 %) fallaron por HTTP 503, en escenarios distintos. Es el principal riesgo para CI.
- **Solo validación local:** E4 no está validado en CI. Pendiente, con autorización: el paso de CI planificado (`@smoke` en PR y suite completa en `main`, ADR-0010 D9).
- **Muestra pequeña:** 3 corridas en un mismo día no bastan para conclusiones estadísticas de estabilidad (Etapa 7).
- **Solo Chromium:** Firefox y WebKit quedan fuera del alcance actual.
- **Datos fechados:** el catálogo y las categorías esperadas son del 2026-11-16.
- **Informes crudos no versionados:** contienen los e-mails sintéticos de las cuentas en los adjuntos de limpieza; `summary.json` contiene solo valores extraídos.
- **Cancelación a mitad de test:** puede dejar una cuenta sin limpiar (no ocurrió en E4).

## 5. E4.5 — Integración con GitHub Actions

> **Implementado y validado en local. No validado en GitHub:** no se ha hecho commit, push ni ejecución en GitHub Actions. La validación real exige publicar la rama y requiere autorización.

### 5.1 Inspección inicial

| Elemento | Estado encontrado |
|---|---|
| Workflows | Uno: `.github/workflows/ci.yml`, un job (`Typecheck, unit, baseline and integration (Chromium)`, 20 min), `push` a `main`, `pull_request` y `workflow_dispatch`, filtros de rutas idénticos, `contents: read` |
| Scripts | `test:e2e` = `playwright test --project=chromium` (E4.1); `test:baseline`, `test:integration`, `test:unit`, `typecheck` |
| `playwright.config.ts` | En CI: 1 worker, 2 reintentos en proyectos SQAF, reporters list + html + clasificación; proyecto `chromium` = `tests/e2e` |
| Etiquetas | `@smoke` en TC2, TC3, TC8, TC9, TC12 y TC16 = **9 tests**; suite completa = **18 tests** (verificado con `--list`) |
| Artifacts existentes | Línea base: solo el JSON de clasificación (INC-2026-11-16). Integración: informe HTML y evidencia de fallo |
| Clasificación | Reporter de E1/E5 sin cambios; escribe la tabla de intentos fallidos en `$GITHUB_STEP_SUMMARY` con evidencia genérica (estado HTTP, marcador, tipo de aserción) |
| Credenciales | `CREDENTIAL_SAFE_EVIDENCE` en las 8 suites con cuenta (contrato unitario) |
| Línea base | `npm run test:baseline`, sin cambios |

### 5.2 Cambios

| Archivo | Cambio |
|---|---|
| `.github/workflows/ci.yml` | Paso `Functional scenarios (SQAF e2e)` + `Upload e2e summary` + `Upload e2e failure evidence (product suites)`; `cancel-in-progress: false` en PR y en `main` (ajuste 2 de §5.8). Detalle en ADR-0003 (cambios de la Etapa 4) |
| `src/reporting/run-summary-reporter.ts` | Reporter observador del resumen seguro (nuevo) |
| `tests/unit/ci/workflow-e2e.spec.ts` | 14 contratos del paso E2E (nuevo) |
| `tests/unit/reporting/run-summary-reporter.spec.ts`, `tests/unit/support/summary-samples.config.ts`, `tests/unit/support/summary-samples/outcomes.sample.ts` | Pruebas del reporter con muestras sintéticas (nuevos) |

Sin cambios en escenarios, Page Objects, fixtures, datos, `playwright.config.ts`, `package.json`, timeouts, versiones ni en los pasos de línea base e integración.

### 5.3 Comportamiento configurado

| Evento | Selección | Tests | Cuentas | Artifacts de e2e |
|---|---|---|---|---|
| `pull_request` (código, pruebas, configuración o workflow) | `--grep=@smoke` | 9 | 2 | `e2e-summary`; `e2e-failure-evidence` solo si falla una suite de producto |
| `push` a `main` | Suite completa | 18 | 8 | Ídem |
| `workflow_dispatch` | Suite completa | 18 | 8 | Ídem |

Un PR no ejecuta dos veces: `push` solo se dispara en `main`. Al fusionar un PR se ejecuta una vez la suite completa en `main`. Un PR solo con documentación no ejecuta el workflow (filtros de rutas).

### 5.4 Validación local

| # | Verificación | Resultado |
|---|---|---|
| 1 | Sintaxis y estructura del workflow | Analizado con el parser YAML que incluye Playwright (sin instalar nada): 0 errores, 0 avisos; 15 pasos en el orden esperado |
| 2 | Eventos y filtros | Sin cambios; contratos `workflow-paths.spec.ts` y `workflow-e2e.spec.ts` |
| 3 | Selección `@smoke` | Script del paso con `GITHUB_EVENT_NAME=pull_request`: 9 tests en 6 archivos |
| 4 | Suite completa | Con `push` y con `workflow_dispatch`: 18 tests en 15 archivos (`--list`) |
| 5 | Comandos | Script del paso ejecutado en local con `CI=true` (ver 5.5) |
| 6 | Chromium | Solo `--project=chromium` (vía `test:e2e`); una sola instalación de navegador |
| 7 | Workers y reintentos | `CI=true`: 1 worker, 2 reintentos en `chromium` |
| 8 | Rutas de artifacts | `reports/run-summary.json` y `test-results-e2e/products-*/`; ningún paso sube `playwright-report-e2e` ni JSON crudo |
| 9 | Credenciales | Contratos de credenciales y de artifacts; reporter probado con un título y un error que contienen un e-mail y una contraseña ficticia: no aparecen en el resumen |
| 10 | Permisos | `contents: read`, sin `secrets` ni permisos de escritura |
| — | Suite unitaria | **305 passed** (285 + 14 contratos de CI + 6 del reporter); typecheck sin errores |
| — | Mutaciones (revertidas) | Ampliar la ruta de evidencia a `test-results-e2e/` y volver a `cancel-in-progress: true`: los contratos fallan |

### 5.5 Simulación local del paso en modo PR

El script del paso ejecutado tal cual con `CI=true`, `GITHUB_EVENT_NAME=pull_request` y un `GITHUB_STEP_SUMMARY` local (2026-11-16, 06:55 UTC):

- **9 passed (1,6 min)**, 0 fallos, 0 *flaky*, código de salida 0.
- Salidas: `reports/failure-classification.json`, `reports/run-summary.json` y `test-results-e2e/` (solo `.last-run.json`, sin fallos). **No se generó informe HTML.**
- Log de consola: 0 e-mails y 0 contraseñas generadas.
- Resumen del job: tabla de clasificación ("No failed attempts") y tabla de la suite (9 tests, 9 aprobados, duración por test), sin datos de prueba.
- 2 cuentas (TC2 y TC16, `testUser`): ambos tests pasaron, así que su fixture verificó con la API 14 que ya no existían (si no, el test habría fallado). Sin informe JSON crudo no queda su `dataId`: no se pudo hacer la verificación manual adicional. Es la misma situación que tendrá CI.

La suite completa (18 tests) no se volvió a ejecutar: se midió en E4.4 y su selección se verificó con `--list`.

### 5.6 Diferencias entre la validación local y la de GitHub

| Aspecto | Local | Pendiente en GitHub |
|---|---|---|
| Runner | Windows 11 | `ubuntu-latest` con `--with-deps` |
| Red hacia el SUT | Red doméstica | IP de GitHub: posible desafío anti-bot de Cloudflare (observado en E0) y HTTP 503 |
| Eventos | Simulados con `GITHUB_EVENT_NAME` | Evaluación real de `on:`, filtros de rutas y concurrencia |
| Artifacts | Rutas comprobadas por contrato | Subida real con `upload-artifact` |
| Duración del job | E2E: 1,6 min (`@smoke`) y ~3,4 min (suite completa, E4.4) | Presupuesto del job: 20 min con línea base e integración; los reintentos de CI pueden alargarlo |

### 5.7 Riesgos y limitaciones

- **Disponibilidad del SUT:** en E4.4, el 7,4 % de las ejecuciones falló por HTTP 503. En CI, con 2 reintentos, un 503 aislado aparecerá como `flaky` y repetirá el escenario: si el escenario usa cuenta, el reintento crea otra (también eliminada y verificada).
- **Anti-bot en runners de GitHub:** puede hacer fallar la línea base y, con ella, todo lo posterior (el paso E2E no se ejecuta).
- **Cancelación:** resuelto en §5.8: ningún run en curso se cancela. Sigue siendo posible una cancelación manual o por `timeout-minutes`.
- **`timeout-minutes: 20`:** sin cambios; con reintentos de los escenarios de checkout (60 s cada uno) podría acercarse al límite.
- **E-mails sintéticos en el log:** resuelto en §5.8 para los mensajes de error y en §5.9 para el informe HTML de integración, que deja de publicarse. El `dataId` ya no aparece en el log de consola (§5.10).
- **Sin verificación manual de cuentas en CI:** solo la automática de las fixtures (que falla el test si la cuenta sigue existiendo).
- **Validación real pendiente:** nada de lo anterior está comprobado en GitHub Actions.

### 5.8 Ajustes finales de seguridad y confiabilidad

**Ajuste 1 — e-mails sintéticos en errores.** `redactSecrets` (`src/utils/redaction.ts`) redacta también las direcciones de e-mail (ADR-0008, ajuste de E4.5). Como todos los errores SQAF y todos los puntos de redacción ya pasan por esa función, el cambio cubre a la vez:

- mensaje, contexto (a cualquier profundidad), evidencia, nota y causas de cualquier `SqafError` (`ApiError`, `InfrastructureError`, `DataValidationError`);
- su serialización JSON (`ApiError.responseMessage` se redacta ahora también);
- los errores de las suites con cuenta, que redacta `credentialGuard` antes de que Playwright los imprima en consola;
- el extracto del informe de clasificación y el resumen seguro de e2e.

Una dirección SQAF conservaba su `dataId` (`[e-mail redacted: user-…]`) para poder localizar la cuenta (sustituido en §5.10: ahora `[e-mail redacted]`). La clasificación y la evidencia HTTP no cambian: `classifyFailure` lee los mensajes originales y la evidencia HTTP solo guarda origen y ruta. Las pruebas encontraron y corrigieron dos defectos: `ApiError.responseMessage` se serializaba sin redactar, y `password=<contraseña generada>` quedaba como `password=[REDACTED]]`.

| Prueba | Qué demuestra |
|---|---|
| `tests/unit/errors/email-redaction.spec.ts` (11, nueva) | El e-mail ficticio no aparece en el mensaje, la serialización JSON, el contexto anidado, la cadena de causas, `DataValidationError`, los errores redactados de un test con cuenta ni el extracto del reporter; los textos que no son direcciones (etiquetas, `paquete@1.2.3`) no cambian; la clasificación y la evidencia HTTP son idénticas |
| `tests/unit/reporting/run-summary-reporter.spec.ts` | Ejecución real de Playwright con un error que contiene un e-mail: no aparece en la consola, el informe de clasificación, el resumen JSON ni el resumen del job |
| Pruebas existentes actualizadas | `account-client.spec.ts` (6 casos), `error-hierarchy.spec.ts` (2) y `secret-redaction.spec.ts` (2) esperaban el e-mail en el mensaje; ahora esperan la forma redactada y que el JSON no lo contenga |

**Ajuste 2 — concurrencia.** `cancel-in-progress: false` para PR y `main`, con el mismo grupo por workflow y rama/PR: nunca hay dos runs en paralelo de la misma rama o PR, un run en curso siempre termina (y con él la limpieza de sus cuentas) y, si llegan varios pushes mientras tanto, GitHub conserva solo el pendiente más reciente. Workers sin cambios (1).

**Validación:** typecheck sin errores; **316 pruebas unitarias** (11 nuevas); 11 pruebas de integración offline con SUT falso; 29 contratos de CI (mutación `cancel-in-progress: true` detectada); YAML sin errores ni avisos; `@smoke` = 9 tests y suite completa = 18 tests. Escaneo de los logs y artefactos de la simulación de PR (`pr-run.log`, resumen del job, `reports/`, `test-results-e2e/`): 0 e-mails, 0 contraseñas generadas, 0 números de tarjeta (la única coincidencia del patrón fue `sqaf-playwright@0.1.0`, el banner de npm, que llevó a exigir un TLD alfabético). No se volvió a ejecutar contra el SUT. `metrics/experiments/E4-sqaf/summary.json` (E4.4) no se modificó.

**Exposición restante (requiere decisión):** el artifact `integration-report` (informe HTML de integración, política aprobada en E2/INC-2026-11-16) contiene e-mails sintéticos en los títulos de paso `Fill "…"` y en los adjuntos `sqaf-account-cleanup`. Corregirlo exige cambiar la política de artifacts o los Page Objects/fixtures, fuera del alcance autorizado. **Resuelto en §5.9** (autorizado el 2026-11-16).

### 5.9 Cierre de seguridad: artefactos de integración

Autorizado el 2026-11-16: corregir la exposición de `integration-report` sin debilitar las pruebas, sin publicar e-mails, identificadores de cuenta, contraseñas ni tarjetas, y con pruebas que lo demuestren. Sin ejecuciones contra el SUT.

**Inventario de la exposición.** Se generó el informe HTML con la configuración anterior del paso de integración, sobre muestras con la forma de `tests/integration/data/account-api.spec.ts` y un SUT falso (prueba de control de `tests/integration/security/integration-artifacts.spec.ts`), y se recorrió su ZIP embebido:

| Ubicación en el informe HTML | Contenido |
|---|---|
| `steps[].title` de cada resultado (`Fill "…"`) | **E-mail** de la cuenta (Playwright escribe el valor tecleado por `loginEmailInput.fill(...)`) y, con él, su `dataId` |
| `results[].attachments[].body` (`sqaf-account-cleanup`) | Antes de este cierre: **e-mail** y `dataId`. Ahora: solo `dataId` |
| `annotations[].description` (`sqaf-test-data`), en el test, en cada resultado y en `report.json` | `dataId` |
| `data/<sha>.md` (`error-context` redactado por `credentialGuard`) | `[e-mail redacted: <dataId>]` |
| `data/<sha>.png` (captura de fallo) | El e-mail **como imagen** del formulario: no se puede redactar ni escanear |
| Nombres de archivo y carpetas | Ni e-mails ni `dataId` |

Como el e-mail se reconstruye con el `dataId` (`sqaf.<dataId>@example.com`), el `dataId` cuenta como identificador de cuenta. Fuera del informe, la carpeta de resultados de las suites con cuenta contiene las mismas capturas y `error-context`, y la de `pages/auth` un e-mail sintético sin redactar (sin `credentialGuard`); la de `pages/checkout-components`, el número de tarjeta en su traza.

**Decisión.** Sanear el informe HTML no es viable: los títulos `Fill "…"` solo se evitan cambiando los Page Objects (el `fill` es la acción probada) y las capturas seguirían mostrando el valor. Por eso:

1. **El paso de integración ya no genera informe HTML ni JSON crudo:** usa los reporters de la CLI, como el paso e2e (`--reporter=list,…failure-classification-reporter.ts,…run-summary-reporter.ts`). Desaparecen `PLAYWRIGHT_HTML_OUTPUT_DIR` y el artifact `integration-report-<run>-<intento>`.
2. **Se publica su resumen seguro** (`integration-summary-<run>-<intento>`, `reports/run-summary.json`), subido justo después del paso y antes de que el paso e2e escriba el suyo. El encabezado del resumen del job es `SQAF integration tests`.
3. **La evidencia de fallo de integración** se limita a las carpetas de `pages/base-page`, `pages/cart`, `pages/products`, `pages/product-components`, `fixtures/anti-bot` y `fixtures/fixtures`. Ya no incluye `reports/` (los extractos de error podían contener `[e-mail redacted: <dataId>]`, forma eliminada en §5.10).
4. **El resumen seguro elimina también el `dataId`** (`[e-mail redacted]`), tanto en integración como en e2e.
5. **En origen:** el adjunto `sqaf-account-cleanup` ya no incluye el e-mail (`fixture`, `dataId`, `deleteOutcome`, `verifiedAbsent`). La limpieza y su verificación automática (borrado, API 14 y `ApiError` si la cuenta sigue) no cambian.

No se modificaron escenarios, Page Objects, clasificación de errores, dependencias, versiones ni timeouts. La única fixture modificada es `src/fixtures/data.fixture.ts` (el registro de limpieza), para sanear el adjunto en origen.

| Archivo | Cambio |
|---|---|
| `.github/workflows/ci.yml` | Paso de integración con reporters de la CLI; `Upload integration HTML report` → `Upload integration summary`; evidencia de fallo restringida |
| `src/reporting/run-summary-reporter.ts` | `sanitizeSummaryText` elimina el `dataId`; `summaryHeading` (integración o escenarios) |
| `src/fixtures/data.fixture.ts` | `AccountCleanupRecord` sin `email` |
| `tests/unit/ci/workflow-integration-artifacts.spec.ts` (6, nueva) | Contratos: reporters de la CLI, sin HTML ni JSON, resumen subido antes del paso e2e, cada ruta de evidencia selecciona exactamente un archivo de `tests/integration` cuyo código no maneja cuentas, e-mails, contraseñas ni tarjetas, y toda suite sensible queda excluida |
| `tests/integration/security/integration-artifacts.spec.ts` (2, nueva) y `tests/unit/support/integration-artifacts*` | Ejecución real con SUT falso, el comando y las rutas de subida leídos de `ci.yml`, y escaneo de lo publicado (ver abajo) |
| `tests/unit/ci/workflow-steps.spec.ts` y `workflow-e2e.spec.ts` | Los contratos que exigían publicar `integration-report` (E2) exigen ahora el resumen seguro y que no exista ese artifact |
| `tests/unit/fixtures/account-cleanup.spec.ts`, `tests/unit/reporting/run-summary-reporter.spec.ts` | Registro sin e-mail; resumen sin `dataId` |
| ADR-0003, ADR-0010 (D12 y riesgo de cancelación), `architecture.md`, `README.md` | Documentación del cambio y de la concurrencia |

**Prueba en ejecución** (`integration-artifacts.spec.ts`, sin SUT real). Un proceso hijo de Playwright ejecuta 6 muestras (cuentas por API y UI, login inválido, tarjeta y producto; 4 fallan a propósito, con 1 reintento) con exactamente los argumentos `--output` y `--reporter` del paso de `ci.yml`; las rutas de subida de `ci.yml` seleccionan lo publicado. Resultado:

- Publicado: `reports/run-summary.json` y solo las carpetas `pages-products…` (captura, traza, vídeo y `error-context`). No se genera ningún HTML ni JSON crudo; `reports/failure-classification.json` existe pero no se publica.
- Escaneo de lo publicado (nombres y contenido, trazas descomprimidas) y del resumen del job: **0** e-mails, **0** `dataId`, **0** contraseñas (generadas y ficticias), **0** números de tarjeta. Consola: 0 e-mails de cuenta, 0 contraseñas generadas, 0 tarjetas.
- Controles (el escaneo no es vacío): las carpetas no publicadas de la suite con cuenta contienen el `dataId` y capturas; la de `pages/auth`, un e-mail; la de `pages/checkout-components`, el número de tarjeta. El informe HTML de la configuración anterior contiene el e-mail en el título `Fill "…"` de cada intento; el adjunto `sqaf-account-cleanup` contiene el `dataId` y ningún e-mail ni contraseña.
- El escáner ignora un único formato: los nombres de los fotogramas de la traza (`page@<sha1>-<marca de tiempo>.jpeg`), que tienen forma de dirección.

**Mutaciones (revertidas, `ci.yml` restaurado con el mismo hash):** publicar `reports/` con la evidencia, publicar `pages-auth-*` o volver a los reporters configurados hacen fallar 2 contratos cada una; publicar `data-account-api-*` hace fallar la prueba en ejecución.

**Validación:** ver el informe de cierre (typecheck, pruebas unitarias, 13 pruebas de integración offline, contratos de CI, YAML y selección `@smoke`/suite completa).

**Puntos abiertos al cerrar §5.9 (resueltos en §5.10):**

- **Log de consola de CI.** Los mensajes de error conservan `[e-mail redacted: <dataId>]` (decisión del ajuste 1), y el log de un repositorio público es visible. Eliminar el `dataId` también ahí exige cambiar `redactEmails` y perder la localización de la cuenta desde el log.
- **Paso `Upload failure evidence` (E1).** Si fallan las unitarias o la línea base, publica `test-results/` (salidas de las pruebas unitarias). Esas salidas contienen literales ficticios del código de las pruebas (`sqaf.user-sample-3@example.com` en la muestra del reporter y la URL `https://user:secret@automationexercise.com` de una prueba de configuración); no hay datos de ejecución, cuentas reales, contraseñas generadas ni tarjetas.

### 5.10 Cierre final de seguridad: `dataId` y evidencias de unitarias

Autorizado el 2026-11-16 para resolver los dos puntos abiertos de §5.9. Sin ejecuciones contra el SUT.

**1. Sin `dataId` en lo público.** `redactEmails` sustituye ahora toda dirección por `[e-mail redacted]`, incluidas las de SQAF (`sqaf.<dataId>@…`). Como todos los puntos de redacción usan `redactSecrets`, el cambio llega a la vez a los mensajes de `SqafError` (con su contexto anidado, causas y serialización JSON), a `ApiError.responseMessage`, a los errores que `credentialGuard` redacta antes de que Playwright los imprima, al extracto del informe de clasificación y al resumen seguro (`sanitizeSummaryText` ya no necesita un paso propio). Los mecanismos internos no cambian: las fixtures conservan el objeto de la cuenta, borran por e-mail, verifican con la API 14 y fallan con `ApiError` si la cuenta sigue. El `dataId` sigue en el adjunto `sqaf-account-cleanup` y en la anotación `sqaf-test-data`, que solo existen en ejecuciones locales (CI no genera informes HTML ni JSON). La clasificación no cambia: `classifyFailure` lee los mensajes originales.

**2. Evidencias de unitarias y línea base.** Con un fallo de las unitarias o de la línea base, solo pueden ejecutarse dos pasos de subida, y ambos publican únicamente `reports/failure-classification.json`:

| Paso | Antes | Ahora |
|---|---|---|
| `Upload baseline classification` (E0/INC-2026-11-16, `!cancelled()`) | `reports/failure-classification.json` | Sin cambios |
| `Upload failure evidence` (E1, `failure()`) | `test-results/` (sin `*-baseline`) y `reports/` | `reports/failure-classification.json` |

`test-results/` contenía `error-context.md` con marcos del código fuente, y en ellos literales ficticios (`sqaf.user-sample-3@example.com`, `https://user:secret@automationexercise.com`). Lo publicado conserva el diagnóstico: por intento fallido, título, archivo, línea, clasificación, evidencia y extracto redactado. Como defensa en profundidad, el reporter de clasificación redacta también el título del test, y `redactSecrets` sustituye los números de tarjeta que superan el algoritmo de Luhn (`[card redacted]`). Ningún título real contiene datos así, por lo que la salida de la línea base no cambia.

| Archivo | Cambio |
|---|---|
| `src/utils/redaction.ts` (y `src/utils/index.ts`) | `redactEmails` sin `dataId`; `redactCardNumbers` dentro de `redactSecrets`; exporta `REDACTED_EMAIL` y `REDACTED_CARD` |
| `src/reporting/run-summary-reporter.ts` | `sanitizeSummaryText` = `redactSecrets` |
| `src/reporting/failure-classification-reporter.ts` | El título del test se redacta (la clasificación no cambia) |
| `.github/workflows/ci.yml` | `Upload failure evidence` publica solo `reports/failure-classification.json` |
| `tests/unit/ci/workflow-failure-evidence.spec.ts` (4, nueva), `tests/unit/support/failure-evidence*` | Contratos y ejecución real de muestras unitarias que fallan con los mismos reporters que CI; escaneo de lo publicable y controles sobre lo no publicado |
| `tests/unit/ci/workflow-steps.spec.ts` | El contrato de INC-2026-11-16 exige ahora que el paso no publique `test-results` |
| `tests/unit/errors/email-redaction.spec.ts`, `error-hierarchy.spec.ts`, `secret-redaction.spec.ts`, `tests/unit/api/account-client.spec.ts`, `tests/unit/reporting/run-summary-reporter.spec.ts` | Esperan `[e-mail redacted]` y ninguna aparición del `dataId` (mensaje, JSON, causas, contexto anidado, errores de test, extracto, consola y resumen); pruebas de tarjetas |
| `tests/integration/security/integration-artifacts.spec.ts` | La consola no contiene ningún `dataId`; el `error-context` de la suite con cuenta contiene `[e-mail redacted]` sin `dataId`; control: el informe HTML local sí contiene el `dataId` |

No se modificaron escenarios, Page Objects, fixtures, clasificación, dependencias, versiones, timeouts ni las evidencias de E0–E3.

**Validación:** typecheck sin errores; **328 pruebas unitarias**; **13 pruebas de integración offline**; **39 contratos de CI**; YAML sin errores ni avisos (15 pasos, `cancel-in-progress: false`); `@smoke` = 9 tests y suite completa = 18 tests.

**Escaneo.** Lo publicable en ambas simulaciones: el resumen de integración, el resumen del job, 2 carpetas `pages-products` (captura, traza, vídeo y `error-context`) y la clasificación de la ejecución unitaria fallida, en total 11 archivos y sus trazas descomprimidas. Resultado: 0 e-mails, 0 `dataId`, 0 credenciales de URL, 0 contraseñas, 0 tarjetas y 0 marcos de código, con la prueba automática y con un `grep` independiente. Controles: las salidas no publicadas contienen todos los valores ficticios (`test-results/` y `playwright-report/` de la ejecución unitaria; `pages/auth` y `pages/checkout-components` de integración).

**Mutaciones (revertidas, hashes restaurados):**

| Mutación | Pruebas que la detectan |
|---|---|
| Volver a conservar el `dataId` | 19 unitarias y la prueba en ejecución de integración |
| Volver a publicar `test-results/` y `reports/` en E1 | 4 contratos de CI |
| No redactar el título en el informe de clasificación | La prueba en ejecución de E1 |

**Limitación.** Si una prueba unitaria falla en CI, el log de consola muestra su marco de código, que puede contener los literales ficticios del código fuente. Ese código ya es público en el repositorio. No aparecen datos de ejecución (cuentas, `dataId`, contraseñas generadas ni tarjetas).

### 5.11 Seudonimización de los registros de cuentas

Autorizado el 2026-11-16, durante la revisión previa a la publicación de E4. Este documento (10 `dataId`, tablas de limpieza de E4.1 y E4.3) y `metrics/experiments/E4-sqaf/summary.json` (24, registros de limpieza de E4.4) contenían los `dataId` reales de las cuentas creadas contra el SUT. Esas cuentas se borraron y la API 14 confirmó que ya no existían, pero el `dataId` reconstruye el e-mail de la cuenta, y D12 (ADR-0010) prohíbe publicarlo.

- Cada `dataId` distinto (34 en total) se sustituyó por un seudónimo estable `cuenta-01`…`cuenta-34`, asignado por orden de aparición y compartido entre ambos archivos. No cambió ningún otro campo, conteo, duración ni resultado. `summary.json` sigue siendo JSON válido, y ningún fragmento del token de ejecución quedó en los archivos.
- `tests/unit/security/versioned-account-ids.spec.ts` impide volver a versionar un `dataId` real o un e-mail SQAF fuera de `tests/`.
- Única excepción: `docs/validation/E3-test-data-management.md`, publicado en v0.3.0 antes de D12. Es evidencia protegida de E3 y no se modifica; sus cuentas también se borraron y se verificaron.
