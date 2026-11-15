# ADR-0007: Page Objects, componentes y fixtures de SQAF

- **Estado:** Aceptado (decisiones D1–D11 aprobadas por la responsable del TFG antes de la implementación)
- **Fecha:** 2026-11-15
- **Etapa:** E2

## Contexto

Al cierre de E1, SQAF tenía la capa de configuración y la clasificación de fallos de infraestructura, pero no tenía Page Objects ni fixtures. Los 15 escenarios de E4 necesitan componentes reutilizables que encapsulen los localizadores y las acciones del SUT, y un punto único de importación que aplique las políticas transversales: bloqueo de anuncios (ADR-0002) y guard anti-bot (ADR-0006).

Hallazgos del SUT que condicionan el diseño:

- **Etapa 0:** los controles enlazados por jQuery ignoran los clics anteriores al evento `load`. Además, el label "Zipcode" apunta a `for="city"`.
- **Inspección del DOM en E2 (2026-11-15):**
  - Cada enlace del header y "View Product" empieza con un glifo de fuente de iconos que forma parte de su nombre accesible.
  - "Add to cart" es un `<a>` sin `href` y, por tanto, no tiene rol `link`.
  - El botón de búsqueda solo tiene un icono: no tiene nombre accesible ni `data-qa`.

## Decisiones

| # | Decisión | Justificación |
|---|---|---|
| D1 | **`BasePage` abstracta, pequeña y de un solo nivel.** Contiene `page`, `header`, `open()`, `waitUntilReady()` y `assertReady()` (abstracta). `navigateTo(path)` es protegida y es la implementación común de `open()` | Centraliza tres hallazgos que se repetirían en las 8 páginas. No contiene nada que no compartan todas |
| D2 | **Composición para lo común.** `HeaderComponent` es una propiedad de `BasePage`; `ProductCard` y `CartModal` son componentes que reciben un `Locator` raíz y no heredan de `BasePage` | Responsabilidad única sin jerarquías profundas |
| D3 | **Aserciones de negocio en los tests.** Los Page Objects exponen `readonly Locator` y acciones, y no envuelven `expect`. La única excepción es `assertReady()`, que es una precondición técnica | Se usan directamente las aserciones con auto-waiting de Playwright y la intención de cada test queda visible |
| D4 | **`testIdAttribute: 'data-qa'`** solo en `sqafUse` (`config/locators.ts`). Prioridad de localizadores: rol, label o texto, `getByTestId`, y CSS solo justificado | Es el mecanismo nativo de Playwright para atributos de automatización. La línea base no lo recibe (contrato) |
| D5 | **Una fixture por Page Object**, perezosa, y todas sobre el mismo `page` del test. Sin un objeto agregado `app` | Es el patrón documentado de Playwright: el test declara lo que usa |
| D6 | **La navegación por clic devuelve `Promise<void>`.** El test pide la fixture de destino y llama a `waitUntilReady()`. Los Page Objects no crean otros Page Objects | Menos acoplamiento y espera explícita |
| D7 | **Proyecto `integration`** (`tests/integration`, Chromium, `sqafUse`), separado de `baseline` y de `tests/e2e`, y ejecutado en CI después de la línea base | Verificar la arquitectura sin mezclarla con E4 ni influir en la línea base |
| D8 | **E2 no crea cuentas.** El formulario de registro se rellena y nunca se envía | El aprovisionamiento y la limpieza pertenecen a E3 |
| D9 | **Interfaces estructurales de entrada** (`LoginCredentials`, `SignupIdentity`, `AccountDetails`) declaradas por los Page Objects. `src/pages` no importa `src/data` | Se respeta la regla de dependencias. Los datos de E3 serán compatibles y las fixtures harán de puente |
| D10 | **Alias `@sqaf/*` → `src/*`** (`paths` sin `baseUrl`), adoptado tras una prueba previa (spike) en ambos entornos | Ver "Path aliases" más abajo y ADR-0004 |
| D11 | **Aislamiento a cargo de Playwright:** contexto y página nuevos por test. Sin `describe.serial`, páginas de worker, `storageState` ni estado global | Paralelismo seguro (`fullyParallel: true`) sin código propio |

### Modelo de navegación (D1, D6)

```
open()            → navigateTo(path)  → page.goto(path) → waitUntilReady()
waitUntilReady()  → 1. page.waitForLoadState('load')      (handlers de jQuery)
                    2. assertNoAntiBotChallenge(page)     (InfrastructureError, ADR-0006)
                    3. assertReady()                      (marca técnica de cada página)
```

- Las páginas a las que solo se llega por un flujo (`AccountInformationPage`, `AccountCreatedPage`, `AccountDeletedPage`) declaran `path = undefined` y `open()` lanza un error explícito.
  - `AccountDeletedPage` en especial **no debe** poder abrirse: un GET a su URL elimina la cuenta de la sesión actual.
- `ProductDetailsPage` depende del producto, así que se abre con `openProduct(id)`, que reutiliza `navigateTo`.
- `ProductsPage.search(term)` espera la recarga (`/products?search=`) y vuelve a llamar a `waitUntilReady()`. Es una navegación dentro de la misma página y no crea otro Page Object.

### Localizadores con justificación de CSS

| Elemento | Localizador | Por qué no es de prioridad superior |
|---|---|---|
| Rejilla de productos | `.features_items .product-image-wrapper` | Sin roles, labels ni `data-qa` |
| "Add to cart" en la tarjeta | `.productinfo` + `getByText` | `<a>` sin `href` (no tiene rol `link`); el overlay duplica el texto |
| Botón de búsqueda | `#submit_search` | Solo tiene un icono: sin nombre accesible ni `data-qa` |
| Detalle del producto | `.product-information` | Contenedor sin rol |
| Tabla del carrito | `#cart_info_table tbody tr` y las celdas `.cart_*` | Sin roles ni `data-qa` |
| Modal del carrito | `#cartModal` (raíz) | El modal no tiene `role="dialog"` |
| Header y "View Product" | `getByRole('link', { name: /^\W*Texto$/ })` | El nombre accesible incluye un glifo de icono. El patrón anclado solo admite caracteres no alfanuméricos antes del texto visible |

### Path aliases (D10)

El spike se hizo en un proyecto temporal aislado fuera del repositorio, con el mismo `tsconfig` y `"paths": { "@sqaf/*": ["./src/*"] }` sin `baseUrl`:

- **TypeScript 7.0.2 (`tsc --noEmit`):** resolvió el alias y detectó un error de tipos intencional a través de él (`TS2322`), lo que demuestra que los tipos se resuelven de verdad. Sin ese error: exit 0.
- **Playwright 1.65.0:** una prueba que importaba un módulo mediante el alias pasó (`1 passed`).

Al no haber inconsistencias, se adoptó el alias. Uso:

- **Suites SQAF (`tests/integration`, `tests/e2e`):** importan `@sqaf/fixtures`.
- **Dentro de `src/`:** se mantienen imports relativos, para que las capas no dependan de la configuración del compilador.

La prueba de arquitectura resuelve el alias igual que `tsconfig`.

### Regla de dependencias

`tests/unit/architecture/dependency-rule.spec.ts` analiza los imports estáticos, dinámicos y `import type` de `config/`, `src/`, `tests/`, `baseline/` y `playwright.config.ts`. Ignora los comentarios, el contenido de strings y los paquetes externos. Falla si:

- una capa importa una capa superior o hermana;
- una suite importa algo distinto de `src/fixtures`;
- hay un import interno que no se resuelve;
- hay un archivo fuera de las capas conocidas.

También verifica que las suites no usen localizadores crudos (`locator()`, `getBy*()`, `$()`). El analizador tiene su propia autoprueba con archivos sintéticos.

## Alternativas descartadas

- **Métodos fluidos que devuelven el Page Object siguiente:** acoplan las páginas entre sí y ocultan la espera de "página lista".
- **Objeto agregado `app` o fábrica genérica de Page Objects:** crea instancias que no se usan y añade una indirección que Playwright ya resuelve con fixtures.
- **Métodos `verifyX()` en los Page Objects o matchers personalizados:** duplican `expect` y ocultan el oráculo del test.
- **Wrappers de `click()` y `fill()`:** Playwright ya espera la accionabilidad.
- **Esperas fijas para jQuery:** sustituidas por la espera al evento `load`.
- **Crear y eliminar cuentas en E2:** anticiparía E3 (D8).

## Consecuencias

- Los tests de E4 importarán solo `@sqaf/fixtures`, y cualquier navegación pasará por `waitUntilReady()`: un desafío anti-bot se reportará como `infrastructure/anti-bot-challenge` en lugar de como un timeout genérico.
- Un cambio en el DOM del SUT se corrige en un único Page Object o componente.
- `createAccount()`, `AccountCreatedPage`, `AccountDeletedPage`, `logout()`, `deleteAccount()` y `loggedInUser` están implementados, pero no se han ejercitado contra el SUT en E2. Se validarán en E3 y E4, cuando exista el aprovisionamiento de cuentas.
