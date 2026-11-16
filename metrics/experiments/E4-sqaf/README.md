# Evidencias E4: escenarios funcionales SQAF

Datos extraídos de las **3 corridas de medición de E4.4** (2026-11-16, local) de los 15 escenarios funcionales en Chromium. Registro narrativo: [`docs/validation/E4-functional-scenarios.md`](../../../docs/validation/E4-functional-scenarios.md) §4.

## Contenido

| Archivo | Descripción |
|---|---|
| `summary.json` | Condiciones, cada corrida (estadísticas, resultado y duración por test, clasificación de fallos, cuentas y escaneo de artefactos), agregados, comparación con E0 y métricas de arquitectura con su método de cálculo |

A diferencia de E0, **no se versionan los JSON crudos** del reporter: sus adjuntos `sqaf-account-cleanup` contienen los e-mails sintéticos de las cuentas de prueba. `summary.json` no contiene e-mails, contraseñas ni datos de tarjeta (lo comprueba el script que lo generó antes de escribirlo).

## Resumen

| Corrida | Inicio (UTC) | Duración | Aprobados | Fallidos | Fallos |
|---|---|---|---|---|---|
| run-1 | 06:26:41 | 197,7 s | 17 | 1 | TC14 (HTTP 503) |
| run-2 | 06:30:14 | 211,7 s | 17 | 1 | TC1 (HTTP 503) |
| run-3 | 06:33:54 | 196,8 s | 16 | 2 | TC15 (HTTP 503), TC8 (HTTP 503) |

Tasa de aprobación observada **92,6 %** (50/54); fallos de infraestructura/SUT 7,4 %; fallos funcionales 0. Cuentas: 24 instancias, 24 verificadas automáticamente, 24 verificadas a mano, 0 activas.

**Validación local, no CI.**
