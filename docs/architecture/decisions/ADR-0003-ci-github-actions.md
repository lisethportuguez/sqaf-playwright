# ADR-0003: Integración continua con GitHub Actions desde la Etapa 0

- **Estado:** Aceptado (workflow implementado; pendiente la primera ejecución remota)
- **Fecha:** 2026-11-15
- **Etapa:** E0

## Contexto

El TFG exige que el framework sea fácil de integrar en los procesos de QA. Si la integración continua se deja para el final, los problemas de entorno (dependencias, navegadores, finales de línea, diferencias entre Windows y Linux) se descubren tarde.

## Decisión

Incorporar **GitHub Actions** desde la Etapa 0 con un workflow (`.github/workflows/ci.yml`) sencillo que evoluciona en cada etapa.

### Diseño inicial

| Aspecto | Decisión | Motivo |
|---|---|---|
| Disparadores | `push` a `main`, `pull_request`, `workflow_dispatch` | Validar cada PR de etapa y permitir ejecuciones manuales |
| Permisos | `contents: read` | Mínimo privilegio |
| Concurrencia | Cancelar ejecuciones obsoletas de la misma rama | Ahorro de minutos y de carga sobre el SUT |
| Node.js | `node-version-file: .nvmrc` | Una sola fuente de la versión para el entorno local y CI |
| Dependencias | `npm ci` con caché de npm | Instalación reproducible desde `package-lock.json` |
| Verificación | `npm run typecheck` antes de las pruebas | Falla rápido ante errores de tipos |
| Navegadores | Solo Chromium (`--with-deps`) | Alcance de E0. Multi-navegador se evaluará más adelante. |
| Workers | 1 (definido en `playwright.config.ts`) | Decisión aprobada. Comparabilidad y uso responsable del SUT. |
| Retries | 0 en el proyecto `baseline` | Medir la estabilidad sin enmascarar fallos |
| Artifact | `playwright-report/`, 14 días, también cuando hay fallos | Evidencia de cada ejecución |
| Secretos | Ninguno | No se requieren: las cuentas de prueba se generan en tiempo de ejecución |

### Configuración necesaria en GitHub

No se necesitan *secrets* ni *variables*. Solo hay que crear el repositorio público `sqaf-playwright` y hacer push.

## Evolución prevista

- E1: artifacts de evidencias (`test-results/`) cuando haya fallos.
- E4: jobs filtrados por tags (smoke en PR, regression en `main`).
- E6: reportes JSON y JUnit, historial de métricas y resumen en `$GITHUB_STEP_SUMMARY`.
- E7 (opcional): ejecución programada y matriz multi-navegador.

## Consecuencias

- Cada PR de etapa queda validado de forma automática y reproducible.
- Las acciones se referencian por versión mayor (`@v5`, `@v4`). Fijarlas por SHA es una mejora de seguridad que se puede evaluar más adelante.
- Las pruebas en CI dependen de la disponibilidad del SUT externo.
