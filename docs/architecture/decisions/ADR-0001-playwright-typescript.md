# ADR-0001: Playwright Test y TypeScript como base tecnológica

- **Estado:** Aceptado
- **Fecha:** 2026-11-15
- **Etapa:** E0

## Contexto

SQAF necesita una herramienta de automatización de pruebas funcionales web que permita construir una arquitectura multicapa (POM, fixtures, DDT, reporting), ejecutar en varios navegadores e integrarse con CI, sin agregar un gran número de dependencias.

## Decisión

Usar **Playwright Test 1.65.0** como runner y biblioteca de automatización, y **TypeScript** (en modo `strict`) como lenguaje.

## Justificación

| Necesidad de SQAF | Capacidad nativa de Playwright Test |
|---|---|
| Estabilidad sin esperas fijas | Auto-waiting en acciones y aserciones *web-first* |
| Fixtures Layer | Sistema de fixtures con inyección de dependencias y setup/teardown |
| Data-Driven Testing | Generación de tests parametrizados en tiempo de carga |
| Escalabilidad de suites | Tags (`tag`), `--grep`, proyectos y paralelismo con workers |
| Reporting y evidencias | Reporters HTML, JSON, JUnit y List, API `Reporter` para reporters propios, trace, video y screenshots |
| Multi-navegador | Chromium, Firefox y WebKit con la misma API |
| Preparación de datos por API | Fixture `request` nativa (sin cliente HTTP adicional) |

TypeScript aporta detección temprana de errores (`tsc --noEmit`), contratos tipados para los datos de prueba y mejor mantenibilidad de los Page Objects.

## Alternativas consideradas

- **Selenium WebDriver:** exige construir esperas, runner, reporting y paralelismo con bibliotecas adicionales.
- **Cypress:** soporte limitado de múltiples pestañas y orígenes, y WebKit experimental.

## Consecuencias

- Las capas de SQAF se construyen sobre capacidades nativas, sin dependencias adicionales.
- El proyecto depende de la evolución de la API de Playwright. Las actualizaciones de versión requieren aprobación y un ADR.
