# ADR-0006: Detección del desafío anti-bot y clasificación de fallos de infraestructura

- **Estado:** Aceptado
- **Fecha:** 2026-11-15
- **Etapa:** E1 (adelanta un subconjunto de la capa de manejo de errores de E5 y de reporting de E6)

## Contexto

El 2026-11-15, dos ejecuciones de CI en `main` fallaron sin cambios de código (detalle en [E1-configuration.md](../../validation/E1-configuration.md)):

| Run | Commit | Intento | Resultado |
|---|---|---|---|
| `43690859628` | `dc0bf7b` | 1 | 5 failed (desafío) |
| `43690859628` | `dc0bf7b` | 2 | 5 passed |
| `43691579360` | `66be969` | 1 | 5 failed (desafío) |

En ambos casos, Automation Exercise (servido a través de Cloudflare) respondió al runner de GitHub con una página de verificación anti-bot: título `One moment, please...` y texto `Please wait while your request is being verified...`. Los cinco escenarios fallaron en su primera aserción, con un mensaje que no revelaba la causa.

ADR-0002 ya preveía clasificar aparte los fallos de infraestructura. La recurrencia (2 de los 6 intentos de CI de ese día) obliga a adelantar una parte en la Etapa 1.

## Decisión

### 1. Detección pura (`src/utils/anti-bot-detector.ts`)

`detectAntiBotChallenge({ title, bodyText })` compara cadenas con las firmas de `config/anti-bot.ts`:

- **Título:** coincidencia **exacta** con un título de desafío, tras normalizar espacios y la elipsis Unicode.
- **Cuerpo:** contiene la **frase completa** de verificación, sin distinguir mayúsculas.

Los fragmentos (`One moment`, `Please wait`) y los títulos que solo *contienen* el título del desafío **no** coinciden. Solo se usan firmas observadas en el SUT.

### 2. Guard de SQAF (`src/errors/anti-bot-guard.ts`)

`assertNoAntiBotChallenge(page)` lanza `InfrastructureError` (`src/errors/infrastructure-error.ts`) si la página actual es un desafío:

- `category = 'infrastructure'`, `classification = 'infrastructure/anti-bot-challenge'`.
- Mensaje con prefijo estable `[SQAF:infrastructure/anti-bot-challenge]`, URL y firmas que coincidieron.

Lo invocarán las fixtures de navegación a partir de la Etapa 2. El test **falla** con una causa explícita en lugar de un timeout genérico.

### 3. Clasificación posterior (`src/errors/failure-classification.ts` y `src/reporting/failure-classification-reporter.ts`)

Un reporter de Playwright examina cada intento fallido (mensajes de error y, si existe, el snapshot `error-context`) y lo clasifica como `infrastructure/anti-bot-challenge` o `unclassified`. Así se clasifican también los fallos de la **línea base, sin modificar su código**.

Salidas:

- Consola: una línea de resumen y una por cada fallo de infraestructura.
- `reports/failure-classification.json` (no versionado; en CI, dentro del artifact `failure-evidence-*`).
- `$GITHUB_STEP_SUMMARY`: tabla en el resumen del job.

Todo lo que no es un desafío queda `unclassified`. La taxonomía completa (automatización, funcional, datos) corresponde a la Etapa 5.

### 4. Garantías

| Garantía | Cómo se asegura |
|---|---|
| El test sigue **fallido** | El reporter es solo observador; `onEnd` no devuelve nada (un estado devuelto sobrescribiría el resultado). Prueba: ejecución hija con 3 fallos → exit code 1 y 3 `failed` en el reporter JSON de Playwright |
| No cambia el exit code | Misma prueba; una mutación que devuelve `passed` en `onEnd` hace fallar 2 pruebas |
| No cambia los retries | Con `retries: 1`, cada fallo tiene exactamente 2 intentos, sean de infraestructura o no; 0 flaky |
| Sin reintentos especiales | No existe lógica de reintento en el detector, el guard ni el reporter |
| Sin evasión | No se cambia el user-agent, no se resuelven desafíos, no se espera a que desaparezcan ni se usan servicios externos. Respetar la protección del SUT es parte del uso responsable (ADR-0002) |
| Sin falsos positivos conocidos | Pruebas negativas: página normal del SUT, otros títulos del SUT, fragmentos de las firmas y el fallo de automatización real de E0 (TC9) |

## Alternativas descartadas

- **Reintentar automáticamente al detectar el desafío:** ocultaría la inestabilidad de la infraestructura y alteraría la medición de estabilidad.
- **Marcar el test como `skipped` o `fixme` al detectar el desafío:** convertiría un fallo en un no-resultado, contra el principio de no ocultar fallos.
- **Modificar la línea base para invocar el guard:** rompería la comparabilidad del experimento.
- **Técnicas para evitar el desafío (cabeceras, navegador "stealth", servicios de resolución):** contrarias al uso responsable del SUT y fuera del alcance ético del TFG.

## Consecuencias

- Un fallo de CI provocado por el desafío se identifica de inmediato en el resumen del job.
- En la Etapa 7, los intentos clasificados como infraestructura podrán analizarse por separado, dejando constancia de la separación. Nunca se eliminarán de los datos.
- Si el SUT cambia la página de desafío, las nuevas firmas se añadirán a `config/anti-bot.ts` solo cuando se observen, con su evidencia.
