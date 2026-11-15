# Verificación E2: la línea base sigue pasando con sus condiciones de E0

> **No son datos experimentales.** Estas corridas solo verifican que la Etapa 2 no alteró la línea base. No forman parte del conjunto experimental de [`metrics/experiments/E0-baseline/`](../../experiments/E0-baseline/), no modifican su `summary.json` y no deben usarse en la comparación de la Etapa 7. Registro narrativo: [`docs/validation/E2-page-objects-fixtures.md`](../../../docs/validation/E2-page-objects-fixtures.md).

## Condiciones

Las mismas de E0 y E1: entorno local (Windows 11, Node.js v26.13.1, Playwright 1.65.0), proyecto `baseline`, Chromium, **1 worker**, **retries 0** y bloqueo de anuncios activo, con el mismo comando:

```
npx playwright test --project=baseline --workers=1 --reporter=json
```

Las variables `CI`, `SQAF_ENV` y `SQAF_BASE_URL` estaban vacías en las tres corridas.

## Inventario

| Archivo | Código | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped | Reintentos |
|---|---|---|---|---|---|---|---|---|
| `raw/run-01.json` | E2 (árbol de `stage/2-page-objects`) | 2026-11-15 19:51:40 | 32.0 s | 5 | 0 | 0 | 0 | 0 |
| `raw/run-02.json` | E2 (árbol de `stage/2-page-objects`) | 2026-11-15 19:52:13 | 34.8 s | 5 | 0 | 0 | 0 | 0 |
| `raw/run-03.json` | E2 (árbol de `stage/2-page-objects`) | 2026-11-15 19:52:49 | 30.1 s | 5 | 0 | 0 | 0 | 0 |

- Las tres corridas se ejecutaron sobre el árbol de trabajo de `stage/2-page-objects` con el código de E2 ya completo (Page Objects, fixtures, configuración y CI), antes del commit. El código no cambió entre las corridas y el commit `feat` de E2.
- Los cinco escenarios pasaron **al primer intento** en las tres corridas (ningún resultado con `retry > 0`).
- Antes y después de las corridas, los SHA-256 de `baseline/baseline.spec.ts`, `config/ad-blocking.ts`, `package-lock.json` y `metrics/experiments/E0-baseline/summary.json` coincidieron con los de `main` (`1eb09f5`).

## Duraciones

Las duraciones (30–35 s) son del mismo orden que la serie oficial de E0 (25–29 s) y menores que las de la verificación de E1 (45–61 s, atribuidas al entorno). No se comparan con E0: son verificaciones, no mediciones.

## Saneamiento

Mismas reglas que E0 y E1: las rutas absolutas del equipo local se sustituyeron por `<PROJECT_ROOT>` (directorio del proyecto) y `<NODE_EXECUTABLE>` (ruta del ejecutable de Node.js). Los archivos siguen siendo JSON válido y no contienen rutas del usuario local.
