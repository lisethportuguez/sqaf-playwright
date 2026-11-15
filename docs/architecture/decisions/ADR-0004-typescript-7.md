# ADR-0004: TypeScript 7.0.2 (provisional) con configuración `strict` explícita

- **Estado:** Aceptado provisionalmente, sujeto a validación continua
- **Fecha:** 2026-11-15
- **Etapa:** E0

## Contexto

El proyecto se generó con `typescript@^7.0.2` (compilador nativo) declarado en `dependencies` y sin `tsconfig.json`. Playwright transpila TypeScript por su cuenta, así que las pruebas se ejecutaban **sin verificación de tipos**.

## Evidencia (2026-11-15)

1. Sin `tsconfig.json`, `tsc --noEmit tests/example.spec.ts playwright.config.ts` produjo **≈100 errores** (`TS2591 Cannot find name 'Buffer' / 'process'`, `TS2550 asyncDispose`). La causa es que en TS 7 la opción `types` vale `[]` por defecto (no carga `@types/node`) y el `lib` por defecto no incluye `esnext`.
2. Con `--types node --module nodenext`, los mismos archivos compilan con **exit 0**.
3. Con el `tsconfig.json` definitivo, `npm run typecheck` da **exit 0**.
4. **Prueba negativa:** un archivo temporal con errores intencionales produjo `TS2322`, `TS7006` (`any` implícito) y `TS6133`, lo que confirma que `strict` y `noUnused*` están activos.
5. `package-lock.json` incluye los binarios nativos de TS 7 para `linux-x64` (runner de CI) y `win32-x64` (local).

## Decisión

- Mantener **TypeScript 7.0.2** y moverlo a `devDependencies`, sin cambiar la versión.
- Usar un `tsconfig.json` explícito con `strict`, `types: ["node"]`, `module`/`moduleResolution: "nodenext"`, `target`/`lib: esnext` (más `dom`), `noEmit`, `isolatedModules` y `noUnusedLocals`/`noUnusedParameters`.
- Ejecutar `npm run typecheck` en CI antes de las pruebas.

## Riesgos y plan de contingencia

| Riesgo | Mitigación |
|---|---|
| TS 7 eliminó `baseUrl`, así que los *path aliases* dependen de `paths` sin `baseUrl` | Verificarlo en E2. Si no funciona, usar imports relativos. |
| Herramientas del ecosistema (p. ej. `typescript-eslint`) podrían no soportar TS 7 | El núcleo de SQAF no depende de ellas. Cualquier incorporación requiere un ADR. |
| Regresiones del compilador nativo | Si aparecieran, volver a una versión 5.x o 6.x con aprobación previa y un ADR que lo reemplace. |

## Consecuencias

Los errores de tipos se detectan antes de ejecutar las pruebas, tanto en local como en CI, con el compilador más reciente y sin dependencias adicionales.
