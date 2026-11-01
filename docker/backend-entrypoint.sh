#!/bin/sh
set -eu

# Dentro de Compose, localhost es el contenedor de la API. Codificar las
# credenciales permite contrasenas con @, :, / u otros caracteres reservados.
# Una DATABASE_URL explicita sigue sirviendo para comandos contra bases _test.
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(node --input-type=module -e '
    const url = new URL("postgresql://postgres:5432/");
    url.username = process.env.POSTGRES_USER;
    url.password = process.env.POSTGRES_PASSWORD;
    url.pathname = "/" + encodeURIComponent(process.env.POSTGRES_DB);
    url.search = "schema=public";
    process.stdout.write(url.href);
  ')"
  export DATABASE_URL
fi

# Reutilizar la validacion del backend antes de aplicar cualquier migracion.
node --input-type=module -e '
  import "reflect-metadata";
  import { validateEnv } from "./dist/config/env.validation.js";
  validateEnv(process.env);
'

exec "$@"
