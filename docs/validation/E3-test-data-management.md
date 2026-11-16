# Validación E3: gestión de datos de prueba

- **Etapa:** E3 (ciclo 1, después de E5)
- **Rama:** `stage/3-5-data-utils-errors` (creada desde `main` en `403115f`, merge de E2, tag `v0.3.0`)
- **Fecha:** 2026-11-15 (hora local, UTC-6)
- **Decisiones:** [ADR-0009](../architecture/decisions/ADR-0009-test-data-management.md) (aceptado e implementado)
- **Estado:** **Completada y cerrada.** PR [#6](https://github.com/lisethportuguez/sqaf-playwright/pull/6) fusionado en `main` (commit de merge `f4f79e7666d9111be641760bd7e8c49c2b80d189`), tag `v0.4.0`. CI del PR [`43800662549`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43800662549) y CI posterior al merge [`43802704575`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43802704575) en verde.

## 1. Alcance

| Incluido | Excluido (otras etapas) |
|---|---|
| Datasets JSON (`test-data/users`, `products`, `checkout`) | Los 15 escenarios funcionales, tags y trazabilidad (E4) |
| Esquemas de validación, providers y catálogo de datasets | Páginas de checkout y pago (E4); la tarjeta de prueba solo se valida |
| Factories de usuarios, credenciales y líneas de carrito | Reporting multiformato y métricas (E6) |
| Data-Driven Testing con el mecanismo nativo de Playwright | Cambios en CI, versiones o dependencias |
| `AccountApiClient` y fixtures `userProfile`, `accountApi`, `newUserData`, `testUser` | |

## 2. Auditoría de la API (sin crear cuentas)

| Fuente | Resultado |
|---|---|
| Documentación oficial (`/api_list`, consultada el 2026-11-15) | API 11 `POST /api/createAccount` (17 campos, 201 "User created!"); API 12 `DELETE /api/deleteAccount` (`email`, `password`, 200 "Account deleted!"); API 14 `GET /api/getUserDetailByEmail` (`email`, 200 con el usuario). API 7–10 (`verifyLogin`) no crean sesión de navegador |
| `GET /api/getUserDetailByEmail?email=sqaf.audit-nonexistent-0@example.com` | HTTP **200**, `Content-Type: text/html`, `{"responseCode": 404, "message": "Account not found with this email, try another email!"}` |
| `GET /api/productsList` | HTTP 200, `text/html`, `responseCode: 200`, 34 productos. Es la fuente de `products/catalog.json` y `products/search-terms.json` |

**Conclusión de diseño:** el cliente valida el `responseCode` del cuerpo y trata como infraestructura solo un estado HTTP 5xx.

## 3. Implementación

| Archivo | Contenido |
|---|---|
| `test-data/users/account-profiles.json` | 2 perfiles (`default`, y `united-states-minimal` sin campos opcionales) |
| `test-data/users/invalid-credentials.json` | 3 casos de login inválido (dominios `example.com` y `.invalid`) |
| `test-data/products/catalog.json` | 4 productos con id, nombre, precio, marca y categoría |
| `test-data/products/search-terms.json` | "Jeans" y "Saree", cada uno con sus 3 productos exactos |
| `test-data/checkout/payment-cards.json` | 1 tarjeta ficticia (número de prueba estándar) |
| `src/data/types/index.ts` | Modelo de datos compatible con los Page Objects y la API (D9) |
| `src/data/validation/schema.ts`, `schemas.ts` | Esquemas sin dependencias y esquemas de dominio |
| `src/data/datasets/index.ts` | Catálogo: archivo y esquema de cada dataset |
| `src/data/providers/dataset-provider.ts` | `createDatasetProvider`, `testData`, `caseTitle` |
| `src/data/factories/{user,credentials,product}.factory.ts` | Factories |
| `src/data/index.ts` | Punto de entrada de la capa |
| `src/api/account.client.ts`, `index.ts` | `AccountApiClient` |
| `src/fixtures/data.fixture.ts` | Fixtures de datos y cuentas |
| `src/fixtures/index.ts` | Fusiona la fixture de datos y exporta `testData`, factories de solo lectura y tipos |
| `config/test-data.ts`, `config/timeouts.ts`, `config/index.ts` | `sqafConfig.testData.rootDir` y `sqafConfig.api.timeout` (15 s) |

## 4. Pruebas unitarias (55 nuevas)

| Archivo | Pruebas | Qué verifica |
|---|---|---|
| `tests/unit/data/validation.spec.ts` | 8 | Valor tipado y congelado; **todos** los problemas con su ruta JSON; campos obligatorios y opcionales; listas (longitud mínima, ids únicos); el mensaje no imprime el valor inválido; e-mails solo sintéticos; productos; usuario completo |
| `tests/unit/data/providers.spec.ts` | 16 | Los 5 datasets reales son válidos, no vacíos y están congelados; todo el catálogo tiene provider; `byId` devuelve el mismo objeto; `where` rechaza una selección vacía; id desconocido; `caseTitle` único. Con archivos sintéticos: archivo inexistente, JSON inválido, sobre y campos erróneos con ids duplicados (todo en un error), dataset vacío, lectura perezosa y única |
| `tests/unit/data/factories.spec.ts` | 12 | Usuario por defecto; determinismo; sobrescritura selectiva (también `birthDate` parcial); perfil sin opcionales; override inválido (3 problemas); 200 usuarios con e-mails y contraseñas únicos y ids reproducibles; credenciales; líneas y total de carrito; cantidades imposibles |
| `tests/unit/data/type-compatibility.spec.ts` | 1 | **Compilador:** `UserAccount` se puede asignar a `LoginCredentials`, `SignupIdentity`, `AccountDetails`, `AccountRegistration` y `AccountCredentials` |
| `tests/unit/data/data-driven.spec.ts` | 6 | DDT sin SUT: 2 tests generados desde los perfiles y 3 desde las credenciales inválidas. Además, `--list` del proyecto `integration` confirma que se genera exactamente un test por caso JSON |
| `tests/unit/api/account-client.spec.ts` | 12 | Con un `request` simulado y las respuestas reales observadas: formulario de la API 11 en el orden documentado y timeout central; consulta 200/404; borrado idempotente; 6 fallos clasificados (`responseCode` inesperado, JSON sin `responseCode`, cuerpo no JSON, HTTP 5xx, fallo de transporte, página anti-bot), siempre **sin la contraseña ni el *call log*** y con el e-mail; detalle de otro e-mail; borrado inesperado |

La regla de dependencias (`dependency-rule.spec.ts`) cubre ahora también las capas `data` y `api`, y pasa sin violaciones.

### 4.1 Mutaciones controladas

Mismo procedimiento que en E5 §3.5, sobre el commit `00dde04`:

| # | Mutación | Pruebas ejecutadas | Fallidas |
|---|---|---|---|
| M5 | Los objetos aceptan campos desconocidos | `tests/unit/data` | 2 |
| M6 | Se aceptan ids duplicados | `tests/unit/data` | 2 |
| M7 | Se aceptan e-mails de dominios reales | `tests/unit/data` | 2 |
| M9 | `deleteAccount` deja de ser idempotente (404 → error) | `tests/unit/api` | 1 |
| M10 | El *call log* completo de Playwright se copia en el error | `tests/unit/api` | 1 |
| M11 | `where()` acepta una selección vacía | `tests/unit/data` | 1 |

Las 6 mutaciones se detectaron.

## 5. Integración contra el SUT

Las pruebas nuevas son 7, en `tests/integration/data/`: 5 de DDT y 2 que crean cuentas.

### 5.1 Primera ejecución: proyecto `integration` completo (27 pruebas)

**25 passed, 2 failed** (58.7 s, 4 workers).

- **Pruebas que pasaron:** las 20 de E2 y las 5 de DDT (3 logins inválidos, búsquedas "Jeans" y "Saree").
- **Pruebas que fallaron:** las 2 que crean cuentas, con `InfrastructureError [SQAF:infrastructure/network]`. La causa fue `apiRequestContext.fetch: getaddrinfo ENOENT automationexercise.com`, un fallo transitorio de DNS del equipo local cuando los workers arrancaron en paralelo.
- **El fallo se comportó como estaba diseñado:**
  - el mensaje incluyó la operación, el endpoint y el e-mail, sin contraseña ni *call log*;
  - en el primer test, la red de seguridad de `newUserData` borró por API con resultado `not-found`;
  - en `testUser`, se ejecutó el intento de borrado posterior al fallo de creación.
- **Verificación independiente:** `GET /api/getUserDetailByEmail` devolvió `responseCode 404` para los dos e-mails (`sqaf.user-mwiiuhub-279ca1d7-1@example.com` y `sqaf.user-mwiiuhsy-c82e160f-1@example.com`). **No quedaron cuentas.**

### 5.2 Segunda ejecución: solo `account-api.spec.ts` (2 pruebas)

**2 passed** (8.2 s).

| Test | Pasos | Registro `sqaf-account-cleanup` |
|---|---|---|
| El cliente crea, consulta y elimina una cuenta | API 11 → API 14 (nombre y e-mail coinciden) → API 12 (`deleted`) → API 14 (no existe) | `newUserData`, `user-mwiiwlw5-220c046e-1`, `deleteOutcome: not-found` (la red de seguridad encontró la cuenta ya borrada) |
| `testUser` proporciona una cuenta que inicia sesión | Creada por API → login por la UI → `Logged in as SQAF Tester` | `testUser`, `user-mwiiwlwl-d10044f0-1`, `deleteOutcome: deleted`, `verifiedAbsent: true` |

- **Verificación independiente:** API 14 devolvió `responseCode 404` para `sqaf.user-mwiiwlw5-220c046e-1@example.com` y `sqaf.user-mwiiwlwl-d10044f0-1@example.com`.
- **Contraseñas:** el informe JSON de la ejecución contiene **0** apariciones del prefijo de contraseña (`Sqaf#`).
- **Elementos de E2 validados por primera vez contra el SUT:** `login()` con una cuenta real y `header.loggedInUser`.

### 5.3 Resumen de cuentas

| Ejecución | Cuentas creadas | Cuentas eliminadas | Huérfanas |
|---|---|---|---|
| 5.1 | 0 (fallo de DNS antes de enviar) | — | 0 (verificado) |
| 5.2 | 2 | 2 | 0 (verificado) |
| Línea base (3 corridas de TC1) | 3 | 3 (por la UI, como en E0) | 0 |

**Peticiones de solo lectura fuera de las pruebas:** 2 de auditoría (§2) y 4 de verificación de la limpieza.

## 6. Data-Driven Testing

| Dataset | Casos | Dónde se ejecuta | Resultado |
|---|---|---|---|
| `users/invalid-credentials.json` | 3 | SUT (`data-driven.spec.ts`) y offline | 3/3 contra el SUT; 3/3 offline |
| `products/search-terms.json` | 2 | SUT (`data-driven.spec.ts`) | 2/2: cada búsqueda devuelve **exactamente** sus 3 productos |
| `users/account-profiles.json` | 2 | Offline (`data-driven.spec.ts` unitario) | 2/2 |

Añadir un caso al JSON añade un test: no hay que tocar código. Esto lo comprueba la prueba `--list`.

## 7. Regresión E0/E1/E2

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | **203 passed**. Las 82 de E1 y E2 siguen pasando; 2 archivos de E1 cambian expectativas por la taxonomía (ver E5 §3.3). Hay 121 nuevas: 66 de E5 y 55 de E3 |
| Contratos de configuración (`baseline-contract`, `sqaf-config`, `sqaf-projects-contract`, `environment`) | Sin cambios, pasan |
| Contratos de CI (`workflow-steps`, `workflow-paths`) | Sin cambios, pasan. `ci.yml` no se modificó |
| Integración de E2 (20 pruebas) | 20/20 en la ejecución 5.1 |
| Línea base E0 | 3 corridas con 5/5 al primer intento: [`metrics/verification/E3-E5-baseline-check/`](../../metrics/verification/E3-E5-baseline-check/) |

**Nota sobre el código final:** después de la ejecución 5.1 cambiaron el patrón de red del clasificador (defecto 3 de E5) y su prueba. Ese cambio no afecta a la ejecución de las pruebas de integración, y las pruebas de cuentas se volvieron a ejecutar después (5.2).

### SHA-256 de los archivos protegidos

| Archivo | SHA-256 (inicio = después de las pruebas = después de la línea base) |
|---|---|
| `baseline/baseline.spec.ts` | `ebf863f5b68c7a090e7861ef41d34106df33db9b17687382e154bca40716cf2c` |
| `config/ad-blocking.ts` | `0669a541d04144c52ff119c6e5755f155610ae47c86bada774d3d6a38dd7a19a` |
| `package-lock.json` | `f77c95b8566751a80eb972eb7841851be51acb6ff7d732c3ce84a7ee7ff3ac62` |
| `metrics/experiments/E0-baseline/summary.json` | `963781da4e9b93629e2c80110b950905042eacb85422b3aa7d232204bdeb2fff` |

No hay dependencias nuevas ni cambios de versión (Node.js 26, Playwright 1.65.0, TypeScript 7.0.2). Las evidencias de E0, E1 y E2 no se modificaron.

## 8. Riesgos y pendientes

| Tema | Situación |
|---|---|
| Tráfico de CI | Resuelto: CI ejecutado (runs `43800662549` y `43802704575`). El paso de integración tiene 31 pruebas: 17 contra el SUT (2 cuentas por ejecución, creadas y eliminadas) y 4 contratos sin SUT |
| Secretos en artefactos | **Resuelto** (§9, ADR-0009 D16). Residual: una aserción sobre el valor de una contraseña dejaría el valor en el mensaje del paso; está prohibido por regla y no existe ninguna |
| Cuenta huérfana por un fallo en el teardown | Posible si la red o el SUT fallan justo durante el borrado. El test falla de forma visible y el mensaje incluye el e-mail |
| Fallo transitorio de DNS local | Observado una vez al arrancar 4 workers. No se añadieron reintentos: SQAF no oculta fallos de infraestructura (ADR-0006) |
| Datos del catálogo | Tomados del SUT el 2026-11-15. Si el SUT cambia su catálogo, el DDT de búsqueda fallará como `assertion/mismatch` y habrá que actualizar el JSON con nueva evidencia |
| Elementos aún no ejercitados contra el SUT | `createAccount()` por la UI, `AccountCreatedPage`, `AccountDeletedPage`, `logout()` y `deleteAccount()` por la UI (E4) |

## 9. Ajuste de seguridad: contraseñas en los artefactos de Playwright

Revisión complementaria del ciclo 1 (2026-11-15). La redacción de `SqafError` no protege los artefactos nativos de Playwright, así que se inspeccionaron todos.

### 9.1 Diagnóstico (servidor local, sin SUT)

Política de CI del proyecto `integration` (`trace` y `video: retain-on-failure`, `screenshot: only-on-failure`), mismo patrón que `testUser` (cuenta por API y login por la UI):

| Artefacto | ¿Contenía la contraseña? | Vía |
|---|---|---|
| Informe HTML, test que **pasa** (se sube siempre en CI) | Sí | Título del paso `Fill "<contraseña>"` |
| `trace.zip` | Sí | Formulario de la API (`*.network`, `resources/`), `params.value` de `fill`, valor del input en los snapshots del DOM |
| `error-context.md` | Sí | `textbox "Password": <valor>` (snapshot de accesibilidad) |
| Captura PNG | No | El navegador muestra puntos |
| Video | No se espera (mismo renderizado que la captura); se desactiva igualmente |
| Informe JSON, clasificación SQAF, consola `list` | No | — |

Artefactos de CI: informe HTML de integración (siempre) y evidencias de fallo (solo si falla), 14 días; el repositorio es **público**.

Mitigaciones evaluadas: `test.step(..., { box: true })` no oculta el paso `Fill`; `PLAYWRIGHT_NO_COPY_PROMPT` no afecta al snapshot de las aserciones; `video` no se puede cambiar dentro de un `describe` (fuerza otro worker).

### 9.2 Solución (ADR-0009 D16)

| Pieza | Archivo | Efecto |
|---|---|---|
| Política `CREDENTIAL_EVIDENCE` (`trace: off`, `video: off`, `screenshot: only-on-failure`) | `config/credential-evidence.ts`, `sqafConfig.credentialEvidence` | Sin traza ni video en las pruebas con credenciales |
| `test.use(CREDENTIAL_SAFE_EVIDENCE)` | `tests/integration/data/account-api.spec.ts` | Declaración en el nivel superior del archivo |
| Fixture `credentialGuard` | `src/fixtures/data.fixture.ts` | Rechaza la política general (`ConfigurationError`, sin crear cuentas); vacía los campos de contraseña antes del snapshot final; redacta las contraseñas en los errores del test |
| `fillSecret` | `src/pages/components/secret-field.ts`, usado en login y alta | Mantiene las comprobaciones de `fill` (rellena vacío) y fija el valor con `evaluate`: no aparece en el título del paso |
| `generatedPassword` y `redactSecrets` | `src/utils/unique.ts`, `src/utils/redaction.ts` | Formato fijo `Sqaf#` + 16 caracteres, reconocible por la redacción |

La política general de E1 (`config/evidence.ts`), `playwright.config.ts` y `ci.yml` **no cambian**: el resto de pruebas conserva trazas, capturas y video en fallo.

### 9.3 Pruebas de contrato

| Archivo | Pruebas | Qué demuestra |
|---|---|---|
| `tests/unit/fixtures/credential-evidence.spec.ts` | 8 | Valores de la política; la política de E1 intacta; el guard rechaza todo modo de grabación (también en forma `{ mode }`); redacción de errores (mensaje, *stack*, `errorContext`, `cause`); toda suite con `testUser`/`newUserData`/`accountApi` declara la política y ninguna otra la usa ni sobrescribe evidencias |
| `tests/integration/security/credential-evidence.spec.ts` (Chromium, servidor falso, **sin SUT**) | 3 | (1) 4 tests con cuenta bajo la política (1 pasa, 3 fallan: aserción y acción con la contraseña en el formulario, y uno solo de API): el servidor recibe 4 contraseñas y **ninguna** aparece en consola, informe HTML (incluidos sus datos comprimidos), JSON, `test-results` ni `error-context.md`; no hay `trace.zip` ni `.webm`; hay 2 capturas; las 4 cuentas se borran. (2) Sin la política, la fixture falla con `ConfigurationError` y el servidor no recibe ninguna creación. (3) Control sin SQAF: el escáner **sí** encuentra la contraseña en `trace.zip` y en el informe HTML |

Las muestras están en `tests/unit/support/credential-samples/` y se ejecutan con la política general de CI (`credential-samples.config.ts`). Este contrato va en el proyecto `integration` porque necesita Chromium (CI lo instala después de las pruebas unitarias).

Mutaciones (aplicadas sobre copias de seguridad y revertidas):

| # | Mutación | Resultado |
|---|---|---|
| MS1 | `fill()` en lugar de `fillSecret` en el login | Detectada: contraseña en los datos del informe HTML |
| MS2 | Sin vaciar los campos de contraseña | Detectada: contraseña en `error-context.md` (snapshot final de la página) |
| MS3 | Sin redactar los errores del test | Detectada: contraseña en `error-context.md` (snapshot de la aserción) |
| MS4 | Guard desactivado | Detectada: el contrato de rechazo falla |

### 9.4 Verificación contra el SUT (una ejecución, política de CI, `--retries=0`)

`CI=1`, `account-api.spec.ts`, `auth.spec.ts` (E2) y `data-driven.spec.ts`: **10/10 pasan** (`fillSecret` funciona en el login real y en el formulario de alta). 2 cuentas creadas y eliminadas:

| Fixture | `dataId` | Borrado | Verificación independiente (API 14) |
|---|---|---|---|
| `newUserData` | `user-mwinvb7j-1ad016cc-1` | `not-found` (el test ya la había borrado) | 404 |
| `testUser` | `user-mwinvb7j-1ad016cc-2` | `deleted`, `verifiedAbsent: true` | 404 |

Escaneo de todos los artefactos de esa ejecución (consola, informe HTML con sus datos comprimidos, JSON de clasificación): **0** contraseñas generadas y **0** pasos `Fill` con contraseña; ningún `trace.zip` ni video.

## 10. Incidente INC-2026-11-16: credenciales en el informe HTML de la línea base

Durante la revisión del CI del PR #6 se detectó que el informe HTML de la línea base E0 (publicado en todas las ejecuciones desde la Etapa 1) contenía el valor tecleado por `fill(password)` en TC1. El detalle completo está en [INC-2026-11-16](../security/INC-2026-11-16-baseline-report-credentials.md).

| Aspecto | Resultado |
|---|---|
| Cuentas de TC1 de los 11 artefactos afectados | 11/11 inexistentes (API 14, `responseCode 404`, solo lectura) |
| Artefactos retirados | 12 informes `playwright-report-*` eliminados: los 11 iniciales y, con autorización posterior, el del CI del PR #6 (`14193813624`). Runs y logs conservados |
| Corrección | CI publica solo el JSON de clasificación de la línea base, y la evidencia de fallo excluye sus salidas (`b977401`). El extracto de error del JSON se redacta (ADR-0008 D13) |
| Archivos de E0 | `baseline/baseline.spec.ts`, `config/evidence.ts` y `playwright.config.ts` sin cambios (SHA-256 iguales a `main`) |
| Pruebas locales | Typecheck; 238/238 unitarias; 4/4 mutaciones; contrato de seguridad 3/3; sonda de `fill` fallido redactada; línea base 5/5 con la cuenta de TC1 eliminada (404) |
| CI (`43798520805`) | Éxito: 238 unitarias, línea base 5/5, integración 30/30. Artefactos: `baseline-classification-43798520805-1` e `integration-report-43798520805-1`, sin ningún `playwright-report-*` y con 0 contraseñas |
| Riesgo residual | Un fallo dentro del `fill(password)` de TC1, con el campo ya localizado, imprimiría el valor en la consola de CI (procedimiento en el incidente, §7) |

## Cierre de E3

| Elemento | Valor |
|---|---|
| PR | [#6](https://github.com/lisethportuguez/sqaf-playwright/pull/6) "E3/E5: Test Data Management, Utilities and Error Handling", **MERGED** (2026-11-16) |
| Commit de merge | `f4f79e7666d9111be641760bd7e8c49c2b80d189` (padres `403115f` y `c518c80`) |
| Tag | `v0.4.0` (anotado), apunta a `f4f79e7`. Sin GitHub Release |
| CI del PR | [`43800662549`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43800662549): success. 257 unitarias, línea base 5/5, integración 31/31, sin reintentos |
| CI posterior al merge | [`43802704575`](https://github.com/lisethportuguez/sqaf-playwright/actions/runs/43802704575) (push a `main`): success. 257 unitarias, línea base 5/5, integración 31/31, sin reintentos. Artefactos sin contraseñas y sin informe HTML de E0 |
| Integridad | Archivos protegidos de E0 con los mismos SHA-256; evidencias de E0, E1 y E2 sin cambios entre `403115f` y `f4f79e7` |
