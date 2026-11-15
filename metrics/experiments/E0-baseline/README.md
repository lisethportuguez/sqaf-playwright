# Evidencias E0: línea base experimental

Salidas del reporter JSON de Playwright de las **seis ejecuciones** de la línea base realizadas en la Etapa 0 (2026-11-15). Se conservan tanto las exitosas como las fallidas. Registro narrativo: [`docs/validation/E0-baseline-runs.md`](../../../docs/validation/E0-baseline-runs.md).

## Contenido

| Archivo | Descripción |
|---|---|
| `raw/run-01.json` … `raw/run-06.json` | Copias **saneadas** de la salida del reporter JSON (ver [Saneamiento](#saneamiento)) |
| `summary.json` | Datos extraídos de cada ejecución: fecha, commit, navegador, workers, retries, duración, resultados por escenario y hashes de integridad |

## Condiciones comunes

Chromium (`devices["Desktop Chrome"]`), proyecto `baseline`, **1 worker**, **retries 0**, bloqueo de anuncios activo, Playwright 1.65.0 y Node.js v26.13.1 en Windows 11 (entorno local). Unidad de análisis: 5 escenarios únicos × 1 navegador = 5 ejecuciones de test por corrida.

## Inventario y clasificación

| ID | Serie | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped | Resultado | Commit |
|---|---|---|---|---|---|---|---|---|---|
| run-01 | 1 | 2026-11-15 06:14:45 | 36.4 s | 4 | 1 (TC9) | 0 | 0 | Fallida | `b9d9ffa` |
| run-02 | 1 | 2026-11-15 06:15:23 | 30.0 s | 4 | 1 (TC9) | 0 | 0 | Fallida | `b9d9ffa` |
| run-03 | 1 | 2026-11-15 06:15:54 | 33.9 s | 4 | 1 (TC9) | 0 | 0 | Fallida | `b9d9ffa` |
| run-04 | 2 | 2026-11-15 06:18:22 | 24.7 s | 5 | 0 | 0 | 0 | Exitosa | `86d33bb` |
| run-05 | 2 | 2026-11-15 06:18:48 | 29.3 s | 5 | 0 | 0 | 0 | Exitosa | `86d33bb` |
| run-06 | 2 | 2026-11-15 06:19:19 | 25.1 s | 5 | 0 | 0 | 0 | Exitosa | `86d33bb` |

- **Serie 1 (run-01 a run-03): invalidada.** En las tres corridas, TC9 falló con `expect(locator).toBeVisible() failed` sobre el heading "Searched Products".
- **Serie 2 (run-04 a run-06): oficial.** 15 de 15 ejecuciones de test pasaron al primer intento.

### Clasificación de los fallos de la serie 1

Son **fallos de automatización**. **No son defectos del SUT** ni fallos de infraestructura.

El botón `#submit_search` del SUT funciona mediante un *handler* de jQuery que se registra cuando la página termina de cargar sus scripts. El test hacía clic antes del evento `load` y el clic se ignoraba sin error, así que la búsqueda nunca se enviaba. Con 1 worker, la ejecución llega antes a ese punto, lo que hace más probable la condición de carrera.

**Corrección** (commit `86d33bb`): `await page.waitForLoadState('load')` antes de interactuar con el control. Es una espera por condición, no una espera fija. Repitiendo el escenario 6 veces con `--repeat-each=6 --workers=1`, antes de la corrección fallaron 4 y pasaron 2; después pasaron las 6.

### TC12 (no incluido en estos JSON)

Durante el desarrollo, **antes** de la serie 1, TC12 ("Add to cart", enlaces también enlazados por jQuery) presentó el mismo defecto: 4 fallos y 2 éxitos con `--repeat-each=6`, y 6 de 6 éxitos tras la misma corrección. Esas ejecuciones de desarrollo **no se guardaron en JSON**. Su única evidencia es el registro en `docs/validation/E0-baseline-runs.md`. La corrección ya estaba incluida en el commit `b9d9ffa`, y TC12 pasó en las seis ejecuciones de este directorio.

## Origen del commit

El JSON del reporter **no registra el commit**. La asociación se **infiere** comparando la hora de cada commit con la hora de inicio de cada corrida:

| Commit | Hora del commit (UTC) | Corridas | Tree |
|---|---|---|---|
| `b9d9ffa` | 06:14:36 | run-01 a run-03 (desde 06:14:45) | `b53a3c0` |
| `86d33bb` | 06:18:21 | run-04 a run-06 (desde 06:18:22) | `c5f5f97` |

El historial se reescribió el 2026-11-15 para sustituir la identidad de autor (por privacidad), **sin cambiar el contenido**: el *tree* de cada commit es idéntico. Hashes anteriores: `b9ddac5` → `b9d9ffa` y `41d3196` → `86d33bb`.

## Saneamiento

Los originales contenían **rutas absolutas del equipo local**: el directorio del proyecto bajo el perfil de usuario de Windows y la ruta del ejecutable de Node.js. Estaban en `config.argv`, `config.configFile`, `config.rootDir`, `projects[].testDir/outputDir/snapshotDir` y, en las corridas fallidas, en `error.stack`, `error.location.file`, `errorLocation.file` y `attachments[].path`.

| Regla | Sustitución |
|---|---|
| Ruta absoluta del proyecto (con barras invertidas o con barras normales) | `<PROJECT_ROOT>` |
| Ruta del ejecutable de Node.js | `<NODE_EXECUTABLE>` |

- **No se omitió ni se eliminó ningún campo.** Solo se sustituyeron esas cadenas. Los resultados (`stats`, estados, duraciones y errores) no cambiaron, y el script de saneamiento lo verificó para cada archivo.
- El número de sustituciones y los hashes SHA-256 del original y de la copia saneada de cada archivo están en `summary.json` → `runs[].sanitization`.
- Los **originales sin modificar** se conservan **fuera del repositorio**, en una ubicación local privada. Se pueden verificar con los hashes `sha256Original`.
- **Datos que no contienen:** credenciales, correos, contraseñas ni datos de usuarios de prueba. El reporter JSON no registra los valores escritos en los formularios, y en estas ejecuciones no hubo salida por consola. Las cuentas de TC1 usan direcciones aleatorias de un solo uso que no aparecen en los archivos.
- El adjunto `error-context.md` referenciado en run-01 a run-03 **no se conserva**: las ejecuciones posteriores sobrescribieron `test-results/`.

## Uso

Estos datos son **la línea base inicial**. No permiten conclusiones de superioridad del framework, porque SQAF todavía no está implementado. La comparación definitiva corresponde a la Etapa 7.
