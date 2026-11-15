# ADR-0002: Automation Exercise como sistema bajo prueba (SUT) y política de bloqueo de anuncios

- **Estado:** Aceptado
- **Fecha:** 2026-11-15
- **Etapa:** E0

## Contexto

El proyecto inicial ejecutaba pruebas contra `playwright.dev`, un sitio que no está pensado para pruebas funcionales. El TFG necesita un SUT con flujos de negocio de punta a punta y requisitos verificables.

## Decisión 1: SUT

Usar **Automation Exercise** (`https://automationexercise.com/`) como único SUT. Cambiarlo requiere autorización expresa.

### Justificación (verificada el 2026-11-15)

- Publica **26 casos de prueba oficiales** (`/test_cases`), que sirven como fuente de requisitos y de trazabilidad.
- Expone **atributos `data-qa`** en formularios clave (`login-email`, `signup-name`, `create-account`, `account-created`, entre otros).
- Ofrece una **API pública** (`/api_list`) con `createAccount` y `deleteAccount`, que permite preparar y limpiar usuarios sin credenciales versionadas.
- Cubre flujos de e-commerce completos: registro, login, catálogo, búsqueda, carrito y checkout.

### Alcance

- **Línea base (E0):** TC1, TC3, TC8, TC9 y TC12.
- **SQAF (objetivo):** 15 casos de prueba (definidos en el plan de implementación).

## Decisión 2: bloqueo de anuncios

### Contexto

El SUT carga Google AdSense. En la Etapa 0 se registró el tráfico de terceros de cinco páginas (`/`, `/products`, `/product_details/1`, `/view_cart` y `/login`):

| Host | Tipo | Acción |
|---|---|---|
| `pagead2.googlesyndication.com` | Publicidad | **Bloquear** |
| `googleads.g.doubleclick.net` | Publicidad | **Bloquear** |
| `fundingchoicesmessages.google.com` | Mensajes de consentimiento y publicidad | **Bloquear** |
| `ep1.adtrafficquality.google` / `ep2.adtrafficquality.google` | Calidad de tráfico publicitario | **Bloquear** |
| `fonts.googleapis.com`, `fonts.gstatic.com` | Tipografías | Permitir |
| `static.cloudflareinsights.com` | Analítica de Cloudflare | Permitir |
| `www.google.com` | Lo invocan los scripts publicitarios | Permitir (deja de solicitarse al bloquear los anteriores) |

### Decisión

Abortar las peticiones a los cinco hosts publicitarios mediante `context.route()`, con **coincidencia exacta de hostname** (`config/ad-blocking.ts`). La política se aplica de forma idéntica en la línea base y en SQAF, y queda separada de la lógica de los escenarios.

### Justificación

Los anuncios interstitial (*vignette*) y los iframes publicitarios son una causa externa de inestabilidad que no forma parte de la funcionalidad bajo prueba. Al bloquearlos se reduce el ruido en las métricas de estabilidad.

### Verificación

Con la política activa se ejecutaron de punta a punta el registro, la eliminación de cuenta, la búsqueda, el detalle de producto y el carrito, sin pérdida de funcionalidad. Las peticiones a `www.google.com` dejaron de producirse.

## Consecuencias y riesgos

- **Dependencia externa:** la disponibilidad y el contenido del SUT no están bajo control del proyecto. Los fallos de infraestructura deberán clasificarse aparte (E5).
- **Desviación de la experiencia real:** las pruebas no reproducen la experiencia con anuncios. Se documenta como limitación.
- **Mantenimiento:** si el SUT incorpora nuevos hosts publicitarios, habrá que actualizar la lista. Nunca se usarán comodines amplios.
- **Uso responsable:** cuentas con identificador único, eliminación garantizada y un número limitado de workers.
