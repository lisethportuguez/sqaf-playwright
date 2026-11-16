# ADR-0010: Escenarios funcionales automatizados (capa de pruebas)

- **Estado:** Aceptado (decisiones D1–D11 propuestas en el análisis de E4 y aprobadas por la responsable del TFG el 2026-11-16). Implementación por bloques: **E4.1, E4.2 y E4.3 implementados y validados en local** en la rama `stage/4-functional-scenarios`; **E4.4 ejecutado en local** (3 corridas, sin CI); **E4.5 (CI) implementado en local**, sin ejecución en GitHub
- **Fecha:** 2026-11-16
- **Etapa:** E4
- **Relacionado:** [ADR-0002](ADR-0002-sut-automation-exercise.md) (SUT y alcance), [ADR-0003](ADR-0003-ci-github-actions.md) (CI), [ADR-0007](ADR-0007-page-objects-fixtures.md) (Page Objects y fixtures), [ADR-0009](ADR-0009-test-data-management.md) (datos, cuentas y D16)

## Contexto

Al cierre de `v0.4.0`, SQAF tiene las capas de configuración, Page Objects, fixtures, datos, API de cuentas, errores y clasificación de fallos, pero ningún escenario funcional: `tests/e2e` está vacío. ADR-0002 fija un objetivo de 15 casos sin enumerarlos. Este ADR fija el alcance y la forma de la capa de pruebas.

## Decisiones

| # | Decisión | Justificación |
|---|---|---|
| D1 | **Alcance: 15 casos oficiales** de Automation Exercise (`/test_cases`), con su número y nombre oficiales (tabla siguiente). Añadir o quitar uno requiere autorización | Requisitos verificables y trazables a una fuente pública. Incluye los 5 de la línea base para el experimento de E7 |
| D2 | **Un archivo por escenario:** `tests/e2e/<área>/tc<NN>-<nombre>.spec.ts` (áreas `authentication`, `products`, `checkout`). Título `TC<n>: <nombre oficial>`, más ` [<id>]` en los casos dirigidos por datos | La política de evidencias es por archivo (D7) y así se aplica de forma exacta. El `:` evita que `-g "TC1:"` seleccione TC12 |
| D3 | **Catálogo único** `src/fixtures/scenarios.ts` (`SCENARIOS`, `scenario(id)`), exportado por `@sqaf/fixtures`. Genera título, etiquetas y anotaciones | Un solo origen de la trazabilidad; las suites no repiten metadatos |
| D4 | **Etiquetas:** `@regression` (todas), `@smoke` (TC2, TC3, TC8, TC9, TC12, TC16) y `@account` (las que crean cuenta). **Anotaciones:** `sqaf-test-case` (TC y enlace oficial) y `sqaf-baseline-pair` (título del test de E0 equivalente) | `@smoke` cubre las tres áreas con 2 cuentas. `@account` permite controlar la carga sobre el SUT. No hay etiquetas por área: la carpeta ya las da |
| D5 | **Fixture `userFlows`** (`src/fixtures/flows.fixture.ts`) con flujos repetidos por tres o más escenarios, cada uno como `test.step` con sub-pasos sin datos en el título: `registerViaUi(user)` (TC1, TC14, TC15, TC23) y `payOrder(card)` (TC14, TC15, TC16; se añade en E4.3 con los Page Objects de checkout) | Elimina la duplicación sin ocultar los pasos en el informe. No es una capa nueva: las fixtures ya dependen de los Page Objects |
| D6 | **Limpieza verificada en ambas fixtures de cuenta.** `newUserData` y `testUser` comparten `cleanUpAccount`: borrado por API 12 (idempotente), comprobación con API 14 de que la cuenta ya no existe, adjunto `sqaf-account-cleanup` con `verifiedAbsent`, y `ApiError` si la cuenta sigue existiendo | Antes, `newUserData` no verificaba la ausencia. Ninguna cuenta de E4 puede quedar sin detectar |
| D7 | **Cuentas:** `testUser` (alta por API) cuando el registro no es el objeto del escenario (TC2, TC4, TC5, TC16); `newUserData` cuando el escenario registra por la UI (TC1, TC14, TC15, TC23). Si el escenario oficial borra la cuenta por la UI, se hace; la fixture vuelve a borrarla y verifica. Todo archivo con cuentas declara `test.use(CREDENTIAL_SAFE_EVIDENCE)` (ADR-0009 D16) | 8 cuentas por ejecución completa en un navegador, cada una eliminada y verificada |
| D8 | **Data-Driven Testing** donde el caso oficial admite variantes sin coste de cuentas: TC3 recorre `users/invalid-credentials.json` (3 casos). TC1 **no** se multiplica por perfiles: cada perfil sería una cuenta más | Minimizar la carga sobre el SUT |
| D9 | **Navegador y CI:** solo Chromium (`npm run test:e2e`). CI planificado: `@smoke` en PR y suite completa en `main` y `workflow_dispatch`, en un paso posterior a integración. **El workflow no se modifica hasta validar E4.1** y con autorización (ADR-0003). Implementado en E4.5 (ADR-0003, cambios de la Etapa 4). Firefox y WebKit quedan fuera del alcance actual | Menos ejecuciones contra un SUT con desafío anti-bot intermitente |
| D11 | **Timeout específico solo para checkout:** TC14, TC15, TC16 y TC23 declaran `timeout: 60_000` (`CHECKOUT_TIMEOUT`) en el catálogo y lo aplican con `test.setTimeout(tc.timeout!)`. El timeout global (30 s) no cambia. El contrato de trazabilidad prohíbe cualquier otro cambio de timeout en las suites | TC1 (solo registro y borrado) tardó 20,3 s; un escenario de checkout añade unas diez cargas de página. Medido en E4.3: TC14 tardó 26,2 s en local, a menos de 4 s del límite global, y en CI es más lento |
| D10 | **Contrato de trazabilidad** (`tests/unit/e2e/traceability.spec.ts`): lista las suites con `playwright test --list` (no las ejecuta) y comprueba catálogo = alcance aprobado, título oficial, archivo y carpeta, etiquetas, anotaciones, `@account` ⇔ fixtures de cuenta, bloques entregados completos y que cada par de la línea base existe en `baseline/` | La trazabilidad no depende de la disciplina manual y no consume SUT |
| D12 | **Nada de lo publicado por CI identifica una cuenta de prueba** (cierre de seguridad de E4.5): ni e-mails, ni `dataId`, ni contraseñas, ni tarjetas, en el contenido ni en los nombres de archivo, ni en los logs de consola (cierre final: `redactEmails` ya no conserva el `dataId`). CI no genera informes HTML ni JSON crudos de integración ni de e2e; publica sus resúmenes seguros (sin `dataId`) y solo las evidencias de fallo de suites sin cuentas ni formularios sensibles; si fallan las unitarias o la línea base, solo `reports/failure-classification.json`, nunca salidas crudas. El adjunto `sqaf-account-cleanup` ya no incluye el e-mail (el `dataId` basta para reconstruirlo en local con `uniqueEmail`). La verificación automática de la limpieza (D6) no cambia | Los títulos `Fill "…"` de Playwright y las capturas muestran el e-mail tecleado; no se pueden sanear sin cambiar los Page Objects. Lo verifican `tests/unit/ci/workflow-integration-artifacts.spec.ts` y `tests/integration/security/integration-artifacts.spec.ts` (ADR-0003, cambios de la Etapa 4) |

### Alcance (D1)

| TC | Nombre oficial | Área | Bloque | `@smoke` | `@account` | Par de la línea base |
|---|---|---|---|---|---|---|
| TC1 | Register User | authentication | E4.1 | | Sí | `TC1 - Register User › registers a new user through the UI` |
| TC2 | Login User with correct email and password | authentication | E4.1 | Sí | Sí | |
| TC3 | Login User with incorrect email and password | authentication | E4.1 | Sí | | `TC3 - Login User with incorrect email and password` |
| TC4 | Logout User | authentication | E4.1 | | Sí | |
| TC5 | Register User with existing email | authentication | E4.1 | | Sí | |
| TC8 | Verify All Products and product detail page | products | E4.2 | Sí | | `TC8 - Verify All Products and product detail page` |
| TC9 | Search Product | products | E4.2 | Sí | | `TC9 - Search Product` |
| TC12 | Add Products in Cart | products | E4.2 | Sí | | `TC12 - Add Products in Cart` |
| TC13 | Verify Product quantity in Cart | products | E4.2 | | | |
| TC17 | Remove Products From Cart | products | E4.2 | | | |
| TC18 | View Category Products | products | E4.2 | | | |
| TC14 | Place Order: Register while Checkout | checkout | E4.3 | | Sí | |
| TC15 | Place Order: Register before Checkout | checkout | E4.3 | | Sí | |
| TC16 | Place Order: Login before Checkout | checkout | E4.3 | Sí | Sí | |
| TC23 | Verify address details in checkout | checkout | E4.3 | | Sí | |

### Diferencias con los casos oficiales (E4.1)

- **TC2, TC4 y TC5** no registran la cuenta por la UI: la crea `testUser` por API, porque el registro no es lo que verifican (D7). TC2 sí la borra por la UI, como el caso oficial.
- **TC3** se ejecuta con 3 casos de datos en lugar de 1 (D8). Para la comparación con la línea base, el caso equivalente es `unregistered-email` (misma contraseña `WrongPassword123` y e-mail no registrado en dominio reservado).
- **TC4** verifica la vuelta a la página de login por su URL (`/login`), su estado listo y la ausencia de "Logged in as".

### Componentes nuevos de E4.2

Markup observado el 2026-11-16 con 6 peticiones GET de solo lectura (sin navegador ni cuentas): `/`, `/products`, `/category_products/1`, `/product_details/1`, `/view_cart` y `/api/productsList`, más `/static/js/cart.js`.

| Componente | Decisión | Justificación |
|---|---|---|
| `ProductGrid` | Rejilla `.features_items` compartida por `HomePage`, `ProductsPage` y `CategoryProductsPage`. `ProductsPage` delega en ella y conserva su API (`productCards`, `productAt`, `productNamed`) | La home tiene la misma rejilla (34 productos) y además un carrusel "recommended items" con las mismas tarjetas fuera de `.features_items`: el ámbito los separa |
| `CategorySidebar` | `.left-sidebar`: encabezado "Category", conmutador de sección por rol `link` con patrón anclado (glifo de icono) y enlace de categoría por rol dentro del `.panel` de su sección | Sin landmark ni `data-qa`. "Dress" existe en Women y en Kids: el enlace se acota a su sección |
| `CategoryProductsPage` | `/category_products/<id>`, encabezado `<sección> - <categoría> Products` (rol `heading` que termina en "Products", porque los precios también son `h2`) | Solo se llega por el sidebar (`path` indefinido) |
| `ProductDetailsPage` | `quantityInput` (rol `spinbutton`: su `<label>` no tiene `for`), `addToCartButton` (patrón anclado por el glifo), `cartModal` y `addToCart(quantity)` | El botón lo enlaza jQuery: la página debe estar lista |
| `CartPage` | `removeButton` por fila (`.cart_quantity_delete`, un `<a>` sin `href` ni nombre, por eso CSS) y `removeItem(name)`, que espera a que el SUT quite la fila | `cart.js` borra la fila por AJAX y, con la última, oculta la tabla y muestra "Cart is empty!" |
| `CartModal.of(page)` | Un único punto para `#cartModal` | Lo usan cuatro páginas |
| Dataset `products/categories.json` | 4 categorías (id, sección, nombre, id de URL, encabezado y productos exactos), con tipo, esquema y provider | TC18 usa `women-dress` y `men-tshirts` |

### Diferencias con los casos oficiales (E4.2)

- **TC8** verifica, además de la visibilidad de los campos, los valores del primer producto según `products/catalog.json` (nombre, categoría, precio y marca).
- **TC9** se ejecuta con los 2 casos de `products/search-terms.json`; el equivalente de la línea base (término "Jeans") es `[jeans]`.
- **TC13** usa "Sleeveless Dress" (id 3) con cantidad 4 y verifica también precio y total.
- **TC17** añade dos productos y los elimina uno a uno: el primero deja solo el segundo y el segundo deja el carrito vacío.
- **TC18** comprueba URL, encabezado y la lista exacta de productos de cada categoría.

### Componentes nuevos de E4.3

Plantillas observadas el 2026-11-16 con GET de solo lectura y sin cuentas: `/view_cart` con un producto en una sesión anónima, y `/checkout`, `/payment` y `/payment_done/0`, que el SUT sirve de forma anónima con los campos vacíos.

| Componente | Decisión | Justificación |
|---|---|---|
| `CartTable` | Modelo de fila de producto (`CartItem`) compartido por `CartPage` y la tabla "Review Your Order" de `CheckoutPage`. `CartPage` delega en él y conserva su API | Mismo markup de filas: sin duplicar selectores |
| `CartPage.proceedToCheckout()` y `CheckoutModal` | "Proceed To Checkout" es un `<a>` sin `href` (localizador por texto). Sin usuario, el SUT muestra `#checkoutModal` ("Register / Login", "Continue On Cart") | jQuery: con usuario abre `/checkout` |
| `CheckoutPage` | Encabezados "Address Details" y "Review Your Order", dos `AddressBlock`, filas de producto (se excluye la fila "Total Amount"), `totalAmount`, comentario y `placeOrder(comment)` | Las dos direcciones solo se distinguen por id (`#address_delivery`, `#address_invoice`) |
| `AddressBlock` | Encabezado y las 7 líneas en orden (`listitem` sin el del encabezado) | Las líneas no tienen nombre ni `data-qa`; siempre son 7, vacías si falta el campo |
| `expectedAddressLines(user)` | Función pura en `src/data/factories`: título + nombre, empresa, dirección, dirección 2, ciudad + estado + código postal, país y teléfono, con espacios normalizados | Confirmada contra el SUT por TC23 |
| `PaymentPage` | Campos `data-qa` y `pay(card)`. Número y CVC con `fillSecret` | La tarjeta es ficticia, pero así ningún valor de tarjeta aparece en los títulos de paso |
| `OrderPlacedPage` | `data-qa="order-placed"` "Order Placed!", mensaje de confirmación, factura y "Continue" | El mensaje "Your order has been placed successfully!" se muestra un instante antes de navegar: se verifica la página final |
| `userFlows.payOrder(card)` | Desde la página de pago abierta hasta "Order Placed!" | TC14, TC15 y TC16 |

### Diferencias con los casos oficiales (E4.3)

- **TC14, TC15 y TC16** verifican la confirmación en `/payment_done` ("Order Placed!" y "Congratulations! Your order has been confirmed!") en lugar del mensaje transitorio "Your order has been placed successfully!".
- **TC14** comprueba además, tras el registro, que el carrito conserva los productos y cantidades, y en la revisión del pedido, cantidades, totales por línea y total.
- **TC16** crea la cuenta por API (`testUser`) e inicia sesión por la UI.
- **TC23** compara las 7 líneas de las direcciones de entrega y facturación con `expectedAddressLines` del usuario registrado; no paga el pedido.

## Consecuencias y riesgos

- **Sin traza ni vídeo** en los escenarios con cuenta (D7): se diagnostican con captura, `error-context` y la evidencia HTTP.
- **Duración:** TC1 tardó 20,3 s y TC14 26,2 s en local con un timeout global de 30 s; los escenarios de checkout tienen 60 s (D11).
- **Cancelación del job:** si un run se cancela a mitad de un test, el teardown puede no ejecutarse y dejar una cuenta sintética (`@example.com`). No hay endpoint para listar cuentas; se documenta como riesgo residual. Mitigación de E4.5: `cancel-in-progress: false` en PR y en `main` (ADR-0003), así que un push nuevo nunca cancela un run en curso; el riesgo queda limitado a una cancelación manual o por `timeout-minutes`.
- **El informe HTML muestra los e-mails sintéticos** en los títulos `Fill "…"` del signup. Son direcciones generadas en dominios reservados, no datos personales; las contraseñas se escriben con `fillSecret`.
