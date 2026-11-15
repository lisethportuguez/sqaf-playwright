# Verificación E1: la línea base sigue pasando con sus condiciones de E0

> **No son datos experimentales.** Estas corridas solo verifican que la Etapa 1 no alteró la línea base. No forman parte del conjunto experimental de [`metrics/experiments/E0-baseline/`](../../experiments/E0-baseline/), no modifican su `summary.json` y no deben usarse en la comparación de la Etapa 7. Registro narrativo: [`docs/validation/E1-configuration.md`](../../../docs/validation/E1-configuration.md).

## Condiciones

Las mismas de E0: entorno local (Windows 11, Node.js v26.13.1, Playwright 1.65.0), proyecto `baseline`, Chromium, **1 worker**, **retries 0** y bloqueo de anuncios activo, con el mismo comando:

```
npx playwright test --project=baseline --workers=1 --reporter=json
```

## Inventario

| Archivo | Código | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped |
|---|---|---|---|---|---|---|---|
| `raw/run-01.json` | E1 (`7146259`) | 2026-11-15 08:08:34 | 53.4 s | 5 | 0 | 0 | 0 |
| `raw/run-02.json` | E1 (`7146259`) | 2026-11-15 08:09:29 | 61.4 s | 5 | 0 | 0 | 0 |
| `raw/run-03.json` | E1 (`7146259`) | 2026-11-15 08:10:32 | 50.8 s | 5 | 0 | 0 | 0 |
| `raw/control-v0.1.0.json` | E0 (`v0.1.0`, `dc0bf7b`) | 2026-11-15 08:11:49 | 45.3 s | 5 | 0 | 0 | 0 |

- Las tres corridas de E1 se ejecutaron sobre el árbol de trabajo de `stage/1-configuration` cuyo contenido de código es el del commit `7146259` (el código no cambió entre las corridas y el commit).
- La corrida de **control** se ejecutó con el código exacto de `v0.1.0`, en un worktree temporal, inmediatamente después, para separar el efecto del entorno del efecto del código (ver [Duraciones](#duraciones)).

## Duraciones

Las cuatro corridas duraron entre 45 y 61 s, frente a 25–29 s de la serie oficial de E0. La corrida de control con el código de `v0.1.0` también duró 45.3 s, con duraciones por escenario del mismo orden. **El aumento se atribuye al entorno (SUT o red en esa franja horaria), no a los cambios de E1.** Por eso estas duraciones no se comparan con las de E0.

## Saneamiento

Mismas reglas que E0: las rutas absolutas del equipo local se sustituyeron por `<PROJECT_ROOT>` (directorio del proyecto, o del worktree temporal en la corrida de control) y `<NODE_EXECUTABLE>` (ruta del ejecutable de Node.js). Los archivos siguen siendo JSON válido.
