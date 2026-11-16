# Verificación del ciclo 1 (E5 + E3): la línea base sigue pasando con sus condiciones de E0

> **No son datos experimentales.** Estas corridas solo verifican que el ciclo 1 no alteró la línea base. No forman parte del conjunto experimental de [`metrics/experiments/E0-baseline/`](../../experiments/E0-baseline/), no modifican su `summary.json` y no deben usarse en la comparación de la Etapa 7. Registros narrativos: [`E5-utilities-error-handling.md`](../../../docs/validation/E5-utilities-error-handling.md) y [`E3-test-data-management.md`](../../../docs/validation/E3-test-data-management.md).

## Condiciones

Las mismas de E0, E1 y E2: entorno local (Windows 11, Node.js v26.13.1, Playwright 1.65.0), proyecto `baseline`, Chromium, **1 worker**, **retries 0** y bloqueo de anuncios activo, con el mismo comando:

```
npx playwright test --project=baseline --workers=1 --reporter=json
```

Las variables `CI`, `SQAF_ENV` y `SQAF_BASE_URL` estaban vacías en las tres corridas.

## Inventario

| Archivo | Código | Inicio (UTC) | Duración | expected | unexpected | flaky | skipped | Reintentos |
|---|---|---|---|---|---|---|---|---|
| `raw/run-01.json` | Ciclo 1 (árbol de `stage/3-5-data-utils-errors`) | 2026-11-16 00:27:24 | 33.8 s | 5 | 0 | 0 | 0 | 0 |
| `raw/run-02.json` | Ciclo 1 (árbol de `stage/3-5-data-utils-errors`) | 2026-11-16 00:28:00 | 39.1 s | 5 | 0 | 0 | 0 | 0 |
| `raw/run-03.json` | Ciclo 1 (árbol de `stage/3-5-data-utils-errors`) | 2026-11-16 00:28:41 | 35.5 s | 5 | 0 | 0 | 0 | 0 |

- **Momento de las corridas:** se ejecutaron sobre el árbol de trabajo con el código del ciclo 1 ya completo, antes del commit. En hora local (UTC-6) era todavía el 2026-11-15.
- **Resultados:** los cinco escenarios pasaron **al primer intento** en las tres corridas (ningún resultado con `retry > 0`).
- **Archivos protegidos:** antes y después de las corridas, los SHA-256 de `baseline/baseline.spec.ts`, `config/ad-blocking.ts`, `package-lock.json` y `metrics/experiments/E0-baseline/summary.json` coincidieron con los de `main` (`403115f`).
- **Cuentas:** TC1 crea y elimina su propia cuenta en cada corrida, como en E0. Su código no cambió.

## Duraciones

Duran entre 34 y 39 s, del mismo orden que la verificación de E2 (30–35 s). No se comparan con E0: son verificaciones, no mediciones.

## Saneamiento

Se aplicaron las mismas reglas que en E0, E1 y E2:

- Las rutas absolutas del equipo local se sustituyeron por `<PROJECT_ROOT>` y `<NODE_EXECUTABLE>`.
- Se comprobó que los archivos no contienen rutas del usuario local, contraseñas (`Sqaf#`) ni e-mails (`@example.com`).
- Los archivos siguen siendo JSON válido.
