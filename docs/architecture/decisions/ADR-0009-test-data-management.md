# ADR-0009: Gestión de datos de prueba, Data-Driven Testing y aprovisionamiento de cuentas

- **Estado:** Aceptado e implementado (aprobado por la responsable del TFG; PR [#6](https://github.com/lisethportuguez/sqaf-playwright/pull/6) fusionado en `main`, commit de merge `f4f79e7`, tag `v0.4.0`)
- **Fecha:** 2026-11-15
- **Etapa:** E3 (ciclo 1)
- **Relacionado:** [ADR-0007](ADR-0007-page-objects-fixtures.md) (D8, D9, D11), [ADR-0008](ADR-0008-error-handling-utilities.md)

## Contexto

Al cierre de E2 no existían datos externos: los tests de integración construían los datos en línea y E2 no creaba cuentas (D8). Los Page Objects declaran interfaces estructurales de entrada (D9), y las fixtures son el punto previsto para conectar los datos. E4 necesita datos reutilizables, escenarios dirigidos por datos y usuarios reales en el SUT sin dejar cuentas huérfanas.

Comportamiento real de la API del SUT, observado el 2026-11-15 con dos peticiones de solo lectura (sin crear cuentas):

- `GET /api/getUserDetailByEmail` con un e-mail inexistente responde **HTTP 200**, `Content-Type: text/html` y `{"responseCode": 404, "message": "Account not found with this email, try another email!"}`.
- `GET /api/productsList` responde HTTP 200, `text/html` y JSON con `responseCode: 200` y 34 productos.
- Conclusión: el resultado real está en el campo `responseCode` del cuerpo, no en el estado HTTP.

## Decisiones

| # | Decisión | Justificación |
|---|---|---|
| D1 | **Datos estáticos en JSON** bajo `test-data/<dominio>/` (`users`, `products`, `checkout`). Cada archivo tiene un sobre `{ description, source?, items[] }` | Los datos se mantienen sin tocar código y cada archivo documenta su procedencia |
| D2 | **Validación en tiempo de ejecución sin dependencias** (`src/data/validation/schema.ts`): esquemas pequeños que tipan y validan a la vez, objetos estrictos (un campo desconocido es un error), todos los problemas con su ruta JSON y un único `DataValidationError` | Restricción: no añadir dependencias (zod, faker). JSON no tiene tipos en tiempo de ejecución |
| D3 | **E-mails solo sintéticos** (dominios reservados RFC 2606: `example.com/org/net`, `*.test`, `*.invalid`), comprobados por el esquema | Ningún dato puede pertenecer a una persona real |
| D4 | **Tipos de datos propios** en `src/data/types`, compatibles con las interfaces de los Page Objects y de la API. La compatibilidad la comprueba el compilador (`tests/unit/data/type-compatibility.spec.ts`) | `src/data` no puede importar `src/pages` (capas hermanas, D9). Un único `UserAccount` sirve para login, alta, formulario y API |
| D5 | **Catálogo de datasets** (`src/data/datasets`) y **providers** síncronos, perezosos, con caché por proceso y objetos congelados: `all()`, `byId()`, `where()` | DDT necesita los casos en tiempo de recolección. Objetos inmutables: un test no puede alterar los datos de otro |
| D6 | **DDT con el mecanismo nativo de Playwright:** un bucle sobre el provider genera un test por caso, con título `<base> [<id>]` (`caseTitle`). Los ids son únicos (validado). `where()` rechaza una selección vacía | Sin lógica duplicada. Un dataset vacío no puede producir un bucle que "pase" sin ejecutar nada |
| D7 | **Factories:** `buildUserAccount` (pura y determinista), `newUserAccount` (id único y contraseña aleatoria), `credentialsOf`, `wrongPasswordFor`, `unregisteredCredentials`, `cartLine`, `cartTotal` y `cartLineTexts`. Admiten valores por defecto (perfil JSON) y sobrescritura selectiva, también parcial en `birthDate`. El resultado se valida | Datos únicos para cada registro, reproducibles a partir del id |
| D8 | **Reproducibilidad:** la identidad (`dataId` → e-mail) es determinista dado el `runToken` (ADR-0008 D11). La contraseña es el único valor aleatorio, no cambia el comportamiento del escenario y nunca se registra. Cada test anota su `dataId` | Una ejecución se puede reconstruir sin exponer secretos |
| D9 | **Cliente `AccountApiClient`** (`src/api`) sobre el `APIRequestContext` de Playwright (fixture `request`): `createAccount` (API 11), `findAccountByEmail` (API 14) y `deleteAccount` (API 12, idempotente: `deleted` o `not-found`). Valida el **cuerpo** y tiene un timeout central (`sqafConfig.api.timeout`, 15 s) | Sin dependencias y con la misma `baseURL` que el navegador |
| D10 | **Errores del cliente:** sin respuesta → `infrastructure/network`; HTTP 5xx → `infrastructure/sut-unavailable`; página anti-bot en lugar de JSON → `infrastructure/anti-bot-challenge`; cualquier otra respuesta inesperada → `ApiError`. Los parámetros nunca se incluyen en el mensaje (sí el e-mail sintético, para limpiar a mano) y el *call log* de Playwright no se copia | No registrar contraseñas. La causa queda clasificada para E7 |
| D11 | **Fixtures** (`src/fixtures/data.fixture.ts`), todas de alcance test: opción `userProfile`, `accountApi`, `newUserData` (usuario no registrado, con borrado de seguridad idempotente en el teardown) y `testUser` (creado por API, borrado por API y **verificado** con API 14 en el teardown) | Sin estado compartido entre tests ni workers (ADR-0007 D11). Cada test es independiente |
| D12 | **Fallo durante la creación:** si `createAccount` falla, `testUser` intenta borrar la cuenta (el SUT pudo guardarla aunque la respuesta se perdiera) y vuelve a lanzar el error **original** | No dejar cuentas huérfanas de forma intencionada |
| D13 | **Evidencia de limpieza:** adjunto `sqaf-account-cleanup` en cada test (fixture, `dataId`, e-mail, resultado del borrado, verificación) y anotación `sqaf-test-data`. Sin contraseña | La limpieza queda auditable en los informes |
| D14 | **`@sqaf/fixtures` exporta los providers y factories de solo lectura** (`testData`, `caseTitle`, `cartLine`...) y los tipos | Las suites siguen importando solo la capa de fixtures (regla de dependencias) y pueden generar tests DDT |
| D16 | **Política de evidencias para credenciales** (ajuste de seguridad tras la revisión del ciclo 1). (a) `CREDENTIAL_EVIDENCE` (`config/credential-evidence.ts`): sin traza, sin video, captura solo en fallo; las suites que usan `testUser`, `newUserData` o `accountApi` declaran `test.use(CREDENTIAL_SAFE_EVIDENCE)` en el nivel superior del archivo. (b) La fixture `credentialGuard`, de la que dependen las tres, **se niega a ejecutar** (`ConfigurationError`, sin crear cuentas) si la política efectiva puede grabar secretos. (c) Las contraseñas se escriben con `fillSecret` (Page Objects), que no deja el valor en el título del paso. (d) Tras el test, `credentialGuard` vacía los campos de contraseña antes de que Playwright tome el snapshot de la página y redacta las contraseñas registradas en los errores del test. La política general de E1 no cambia para el resto de pruebas | Verificado con Playwright 1.65: la traza guarda los formularios de la API, los parámetros de `fill` y el valor del DOM; el informe HTML guarda `Fill "<contraseña>"` incluso en tests que pasan; `error-context.md` incluye `textbox "Password": <valor>`. La redacción de `SqafError` no alcanza a esos artefactos |
| D15 | **Configuración:** `config/test-data.ts` (raíz de los datasets) y `SQAF_API_TIMEOUT` en `config/timeouts.ts`, expuestos como `sqafConfig.testData` y `sqafConfig.api`. `TimeoutPolicy` y la línea base no cambian | Valores centralizados (ADR-0005) sin alterar los contratos de E1 |

## Alternativas descartadas

- **zod o faker**: dependencias nuevas no autorizadas. D2 y D7 cubren la necesidad.
- **`import` de JSON**: necesita `resolveJsonModule` y no valida en tiempo de ejecución. Además, el analizador de dependencias solo resuelve `.ts`.
- **`storageState` o cuentas compartidas por worker**: contradicen ADR-0007 D11 y acoplan los tests.
- **Login por API** (`/api/verifyLogin`): solo verifica las credenciales, no crea la sesión del navegador.

## Consecuencias

- **Tráfico en CI:** el paso de integración pasa de 20 a 27 pruebas (10 a 17 contra el SUT). Dos crean y eliminan una cuenta cada una, con 3 peticiones de API más. No se modifica el workflow.
- **Secretos en artefactos (resuelto por D16):** sin D16, la contraseña de la cuenta sintética aparecía en la traza (formularios de API, parámetros de `fill`, DOM), en el **informe HTML de tests que pasan** (título del paso `Fill`) y en `error-context.md`. Con D16, un contrato de ejecución (`tests/integration/security/credential-evidence.spec.ts`, sin SUT) comprueba que ningún artefacto contiene las contraseñas, que las fixtures rechazan la política general y que el escáner sí detecta la fuga en un caso de control.
- **Diagnóstico de las pruebas con cuenta:** sin traza ni video; se conservan la captura (el navegador enmascara la contraseña), `error-context.md` redactado, el *call log* y los adjuntos de limpieza.
- **Regla para las suites:** no hacer aserciones sobre el valor de una contraseña: el mensaje del paso fallido quedaría en el informe HTML.
- **Una cuenta puede quedar huérfana** si el SUT o la red fallan justo en el teardown. El fallo es visible (el test falla en la limpieza) y el mensaje incluye el e-mail para borrarla a mano.
