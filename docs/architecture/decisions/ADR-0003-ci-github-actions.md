# ADR-0003: Integración continua con GitHub Actions desde la Etapa 0

- **Estado:** Aceptado. Validado en E0 (runs `43689246937`, `43690125007` y `43690457916`). Actualizado en E1 (filtros de rutas, pruebas unitarias y evidencias de fallo).
- **Fecha:** 2026-11-15
- **Etapa:** E0 (actualizado en E1)

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

### Cambios de la Etapa 1

| Aspecto | Decisión | Motivo |
|---|---|---|
| Pruebas unitarias | Paso `npm run test:unit` después del typecheck y antes de instalar Chromium | Validan la configuración, el contrato de la línea base, el detector y el reporter sin navegador ni SUT. Si fallan, no se ejecuta la línea base contra el SUT |
| Evidencias de fallo | Artifact `failure-evidence-<run>-<intento>` con `test-results/` y `reports/`, solo si el job falla, 14 días | Diagnóstico de fallos (traces, screenshots y videos de SQAF, y la clasificación de fallos, ADR-0006) |
| Clasificación de fallos | El reporter escribe en `$GITHUB_STEP_SUMMARY` | Un fallo por el desafío anti-bot se identifica en el resumen del job (ADR-0006) |
| Filtros de rutas | `paths` en `push` y `pull_request` (ver abajo) | No ejecutar la línea base contra el SUT por cambios solo documentales |

#### Filtros de rutas

**Contexto.** El 2026-11-15, dos commits que solo modificaban documentación (`dc0bf7b` y `66be969`) ejecutaron la línea base completa contra el SUT, y ambos sufrieron el desafío anti-bot de Cloudflare (ADR-0006). Cada ejecución innecesaria aumenta la carga sobre el SUT y la exposición al desafío.

**Decisión.** Un cambio que **solo** afecta a `docs/**` o a archivos Markdown no ejecuta el workflow. Se usa `paths` con exclusiones y reinclusiones, no `paths-ignore`:

```yaml
paths:
  - '**'                    # todo dispara CI por defecto...
  - '!docs/**'              # ...salvo la documentación
  - '!**.md'                # ...y los archivos Markdown
  - '.github/workflows/**'  # pero estas rutas SIEMPRE disparan CI,
  - 'config/**'             #   aunque el archivo cambiado sea Markdown
  - 'src/**'
  - 'tests/**'
  - 'baseline/**'
  - 'playwright.config.ts'
  - 'tsconfig.json'
  - 'package.json'
  - 'package-lock.json'
  - '.nvmrc'
```

- `paths-ignore` no permite reincluir rutas: un `.md` dentro de `src/` o `config/` quedaría excluido. Con `paths`, GitHub evalúa los patrones en orden y un patrón positivo posterior reincluye lo excluido antes.
- El workflow se ejecuta si **al menos un** archivo modificado queda incluido. Un commit mixto (documentación y código) siempre ejecuta CI.
- Cualquier archivo no excluido (`.gitignore`, `.gitattributes`, `LICENSE`, `.env.example`, JSON de `metrics/`) también dispara CI: el filtro es conservador.
- En `pull_request`, GitHub evalúa el diff completo del PR respecto de la rama base, no solo el último commit.
- **Ejecución manual:** `workflow_dispatch` no tiene filtros y ejecuta siempre el pipeline completo, con la línea base. Se lanza desde la pestaña *Actions* o con `gh workflow run CI --ref <rama>`.
- Las dos listas (`push` y `pull_request`) deben ser idénticas. Lo verifica `tests/unit/ci/workflow-paths.spec.ts`, junto con que cada ruta crítica se reincluya después de la última exclusión y que `workflow_dispatch` no tenga filtro. La verificación con eventos reales está en [E1-configuration.md](../../validation/E1-configuration.md).

**Riesgo aceptado.** Un commit solo documental en `main` no deja un run de CI asociado; el último estado de CI de `main` sigue siendo el del último cambio de código.

### Configuración necesaria en GitHub

No se necesitan *secrets* ni *variables*. Solo hay que crear el repositorio público `sqaf-playwright` y hacer push.

## Evolución prevista

- E1 (hecho): artifacts de evidencias cuando hay fallos, pruebas unitarias, clasificación de fallos en `$GITHUB_STEP_SUMMARY` y filtros de rutas.
- E4: jobs filtrados por tags (smoke en PR, regression en `main`).
- E6: reportes JSON y JUnit, historial de métricas y resumen completo en `$GITHUB_STEP_SUMMARY`.
- E7 (opcional): ejecución programada y matriz multi-navegador.

## Consecuencias

- Cada PR de etapa queda validado de forma automática y reproducible.
- Las acciones se referencian por versión mayor (`@v5`, `@v4`). Fijarlas por SHA es una mejora de seguridad que se puede evaluar más adelante.
- Las pruebas en CI dependen de la disponibilidad del SUT externo.
