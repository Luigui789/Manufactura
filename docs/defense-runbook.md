# Runbook técnico de defensa

1. **Preparar Docker:** copiar `.env.example` a `.env` y configurar credenciales
   locales y JWT_SECRET aleatorio según [setup](setup.md). No guardar secretos en Git.
   Para recuperar una demo usada, hacer copia de cualquier dato necesario antes de:

   ```sh
   docker compose down -v
   docker compose up --build -d --wait
   ```

   **`down -v` destruye los datos locales de los volúmenes de Compose.** Es una
   reconstrucción manual, nunca un reset automático del seed o del backend.
   En un entorno nuevo basta `docker compose up --build -d --wait`.

2. **Migrar:** el backend de desarrollo aplica las migraciones al arrancar.
   Verificar con `docker compose run --rm --no-deps backend pnpm exec prisma migrate deploy`.
   PostgreSQL, Mosquitto, backend y frontend deben estar healthy en `docker compose ps`.
3. **Contraseña de demo:** establecer una frase temporal propia de 15–128 caracteres
   sin copiar una contraseña real en documentación, terminal grabada o capturas.

   PowerShell:

   ```powershell
   $env:DEMO_USER_PASSWORD = Read-Host 'Frase temporal local de demo'
   ```

   Bash:

   ```bash
   read -rs -p 'Frase temporal local de demo: ' DEMO_USER_PASSWORD
   export DEMO_USER_PASSWORD
   ```

4. **Seed oficial** (solo development/demo, no startup production):

   ```sh
   docker compose run --rm --no-deps -e DEMO_USER_PASSWORD backend sh -c 'cd /app && pnpm demo:seed'
   ```

5. **Verificar readiness:**

   ```sh
   docker compose run --rm --no-deps backend sh -c 'cd /app && pnpm demo:verify'
   ```

   Esperado `Dataset ready for demonstration.` Repetir seed/verify antes de operar
   no debe crear registros extra. El seed no repone inventario usado ni cambia
   contraseñas de usuarios existentes.

6. **Login:** abrir [frontend local](http://localhost:5173). Usar las cuentas
   `compras.demo`, `inventario.demo`, `produccion.demo`, `ventas.demo` y
   `admin.demo` con dominio `@ecosoap.test` y la frase configurada.
7. **Ensayo:** ejecutar [smoke](final-smoke-checklist.md) o el
   [guion completo](defense-demo-checklist.md). El smoke y C6 consumen el dataset;
   ensayar y recuperar la base antes de la defensa, no ejecutar C6 justo antes de
   una demostración que exige inventario inicial intacto.
8. **Demo usada:** `demo:verify` muestra NOT READY por inventario actual, aunque
   `Initial stock ledger` siga PASS. No corregir automáticamente saldos ni volver
   a sembrar para ocultarlo; usar la recuperación manual del paso 1.

## Automatización aislada

Para `pnpm demo:e2e` / backend `test:defense`, `DATABASE_URL` debe apuntar a una
base **nueva `_test`** con migraciones/dataset oficiales; MQTT accesible y
`pnpm --filter simulator build` ejecutado. Secuencia: seed → verify READY →
demo:e2e PASS → verify NOT READY (salida 1 intencional). La configuración de C6
habilita MQTT real en development y exige la contraseña del seed. No usar la base
que se mostrará por UI. CI ya provisiona otra base y ejecuta el simulador real.

En host, `pnpm demo:seed`, `pnpm demo:verify` y `pnpm demo:e2e` usan las variables
de entorno y `.env`; no cambiar DATABASE_URL a producción. Instalar con
`pnpm install --frozen-lockfile`; generar cliente y aplicar migraciones según setup.
No correr builds sobre el mismo checkout simultáneamente.

## Recuperación de servicios

Sin una simulación activa, `docker compose restart mosquitto` debe producir
reconexión y nueva suscripción en logs del backend. `docker compose restart backend`
conserva PostgreSQL y vuelve healthy; no resembrar al reiniciar. Para diagnosticar:
`docker compose ps` y `docker compose logs --tail 100 backend mosquitto`.
Un 5xx lleva `X-Request-Id`; correlacionarlo con SafeExceptionFilter sin pedir
contraseñas, JWT o connection strings. Los detalles crudos de drivers se omiten.

Al terminar, quitar DEMO_USER_PASSWORD del entorno (`Remove-Item Env:DEMO_USER_PASSWORD`
en PowerShell, `unset DEMO_USER_PASSWORD` en bash). No hacer upgrades antes de defender.
