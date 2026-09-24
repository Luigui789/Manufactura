# ADR 001 — pnpm como gestor único del monorepo

- **Estado:** Aceptado
- **Fecha:** 2026-09-22
- **Etapa:** 1 — Configuración inicial

## Contexto

El proyecto necesita un frontend y un backend independientes pero coordinados, desarrollados por
tres personas en máquinas distintas. Tres gestores de paquetes eran viables (npm, yarn, pnpm) y la
mezcla accidental de dos de ellos produce lockfiles contradictorios e instalaciones que funcionan
en una máquina y no en otra.

## Decisión

pnpm es el gestor **oficial y exclusivo**. El repositorio es un monorepo con `pnpm-workspace.yaml`
que declara `frontend` y `backend`. La versión se fija en el campo `packageManager` del
`package.json` raíz y se asegura con Corepack.

El único lockfile versionado es `pnpm-lock.yaml`. `package-lock.json` y `yarn.lock` están en
`.gitignore` y su aparición se considera un error.

No existe `packages/shared`: se creará solo si aparece una necesidad real de compartir tipos entre
frontend y backend.

## Consecuencias

- Una sola instalación desde la raíz cubre ambas aplicaciones, y los scripts del monorepo delegan
  con filtros (`pnpm --filter backend start:dev`).
- `node_modules` usa enlaces simbólicos hacia un almacén de contenido. Eso ahorra espacio pero
  **es incompatible con carpetas sincronizadas automáticamente** (OneDrive, Dropbox): el
  repositorio debe clonarse fuera de ellas.
- Desde pnpm 10 los scripts de instalación de las dependencias están bloqueados por defecto. Los
  que el proyecto necesita se declaran en `onlyBuiltDependencies`, a partir de lo que pnpm reporta
  realmente, no por anticipación.
- Cada aplicación declara sus propias dependencias; no se mezclan dependencias funcionales entre
  frontend y backend.
