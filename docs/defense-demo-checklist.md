# C6 — Guion de defensa EcoSoap

## Preparación y aceptación

Usar `develop` con C5 y una base **aislada cuyo nombre termine en `_test`** para
la automatización. Configurar `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`,
`MQTT_URL` y `DEMO_USER_PASSWORD` por entorno. No publicar secretos ni grabarlos
en evidencias. El broker debe estar disponible y `pnpm --filter simulator build`
debe haber generado el CLI. Ejecutar las migraciones existentes, sin crear nuevas.

```sh
pnpm demo:seed
pnpm demo:verify
pnpm demo:e2e
pnpm demo:verify
```

Antes: `Dataset ready for demonstration.` Después: `NOT READY` y código de salida
no cero por `Current inventory readiness = FAIL`; `Initial stock ledger = PASS`.
El E2E también comprueba esta diferencia. No vuelve a sembrar, modifica contraseñas,
borra transacciones ni reconstruye automáticamente la base. Para otra ejecución,
provisionar manualmente otra base limpia y aplicar migraciones y seed.

`demo:e2e` ejecuta únicamente `backend/test/integrated-defense.e2e-spec.ts` con
AppModule, guards, cookies, validación, PostgreSQL, MQTT y el CLI real. El modo
`development` de esa configuración habilita la suscripción MQTT; `test` la desactiva.
El límite de intentos de login se desactiva mediante el helper E2E existente.
La suite general `test:e2e` conserva todas sus pruebas anteriores y excluye C6,
porque esas pruebas consumen o alteran el dataset. CI ejecuta C6 en Docker sobre
otra base limpia con el simulador real lanzado por la API.

## Barra — escenario principal

1. **Login COMPRAS:** `compras.demo@ecosoap.test`, con la contraseña configurada.
   Mostrar proveedor `SUP-ACU-001`.
2. **Compra:** crear OC de `MP-ACU`, 10000 mL, precio ilustrativo 1; confirmar y
   mostrar `CONFIRMED`. Ese precio no constituye evidencia financiera.
3. **Recepción (COMPRAS):** recibir todo en `ALM-PRINCIPAL`. Mostrar comprobante,
   movimiento `PURCHASE_RECEIPT`, lote de MP-ACU y stock 10000 mL.
   Cambiar a **INVENTARIO** para consultar saldos y lotes.
4. **Login PRODUCCION:** `produccion.demo@ecosoap.test`. Crear OP `INT-ACU-FIL`,
   5000 mL, BOM activa v1. Mostrar único requirement `MP-ACU = 5000 mL`.
   Iniciar y completar asignando 5000 mL del lote recibido.
5. Mostrar lote intermedio `RELEASED`, entrada 5000 mL y saldo MP-ACU 5000 mL.
   Abrir trazabilidad: lote filtrado → OP → lote crudo → recepción → OC → proveedor.
6. Crear OP `PT-JABON-500`, 10 UNIT. Mostrar requirements directos:
   INT-ACU-FIL 5000 mL, NAOH 700 g, agua 1800 mL, esencia 50 mL.
   MP-ACU no aparece directamente. Mostrar BOM multinivel y ruta; iniciar.
7. **IIoT:** iniciar prueba `bar / normal`. Mostrar overview, dispositivo y
   lecturas de la OP. Las alertas normales pueden estar vacías. Para mostrar una
   desviación, usar una OP separada de 1 UNIT y `bar / deviation`.
   El perfil real dura 60 muestras a 1 s y empieza a desviarse tras el 55%; la
   automatización consulta cada 300 ms, espera lecturas hasta 20 s y permite hasta
   75 s para la alerta WARNING/CRITICAL. Un timeout muestra OP, estado y conteos.
8. Para el control de cuarentena, filtrar otros 500 mL del lote crudo, completar
   la OP de desviación de 1 UNIT con ese aceite y aprobar su lote de control.
   Completar la OP principal: producir 10 UNIT y asignar 5000 mL del lote filtrado.
   Mostrar cuatro consumos reales, salida +10 y lote `QUARANTINED`.
9. **VENTAS:** crear orden `CLI-VERDE-001`, 5 UNIT de barra. Su confirmación
   devuelve 409 mientras solo hay 1 UNIT liberada. Crear y confirmar otra venta
   de control de 1 UNIT: intentar despacharla con el lote principal en cuarentena
   devuelve 409 «Solo se pueden despachar lotes liberados», sin despacho ni reducción de saldo (11 UNIT).
   Despachar esa unidad del lote de control liberado: quedan 10 UNIT principales.
   **PRODUCCION / Calidad:** aprobar inspección y mostrar `RELEASED` y stock 10.
10. **Sostenibilidad (PRODUCCION):** crear footprint DRAFT. Mostrar cuatro
    actividades automáticas con snapshots DEMO-ACU-FIL, DEMO-NAOH, DEMO-WATER y
    DEMO-ESSENCE. No hay MP-ACU directo. Mostrar circularidad 5000 mL = **5 L**
    valorizados; no se resta del carbono. Agregar DEMO-ELECTRICITY, **5 kWh manuales**.
    Mostrar missingFactors vacío, preview e intensidad positivos. Finalizar con:
    «Estimación académica parcial cradle-to-gate para el escenario integrado EcoSoap.»
    Mostrar FINALIZED y rechazo 409 al agregar otra actividad.
11. **VENTAS:** confirmar la orden principal y despachar 5 UNIT del lote aprobado. Mostrar SaleDispatch,
    movimiento -5 y saldo de producto/lote **5 UNIT**.
12. **ADMIN / dashboard Producción:** filtrar PT-JABON-500, mostrar OP completada
    y cantidades coherentes en UNIT. Durante C6, antes del caso SCRAP, planificado
    11 y producido 11: incluye la muestra de control de desviación. Los demás dashboards
    de negocio y el general no existen en esta base; no forman parte de C6.

## Líquido — escenario reducido

- Con PRODUCCION, filtrar otros 1500 mL del lote crudo; mostrar lote RELEASED.
- Mostrar `PT-JABON-LIQ`, BOM activa v1 y ruta de llenado/embotellado, tapado y
  etiquetado. Su formulación y presentación son supuestos académicos del dataset.
- Crear OP 10 UNIT: aceite filtrado 1500 mL, NAOH 200 g, agua 3000 mL, esencia
  30 mL, 10 botellas, 10 tapas y 10 etiquetas; sin MP-ACU directo.
- Iniciar `liquid / normal`, mostrar lecturas propias sin compararlas con barra.
- Completar asignando el lote filtrado: mostrar consumos de botella, tapa,
  etiqueta (-10 cada uno), demás materiales y output +10.
- Mostrar lote QUARANTINED, aprobar inspección y mostrar RELEASED.
- Crear footprint DRAFT con siete actividades, packaging en categoría PACKAGING,
  snapshots y missingFactors vacío. No es obligatorio finalizar esta huella.

## Regresiones y cierre

- Crear otra muestra independiente de 1 UNIT usando otros 500 mL filtrados del
  aceite restante. Rechazar inspección y disponer SCRAP: lote SCRAPPED, salida
  de scrap y barra principal aún en 5 UNIT. Saldo crudo final 2500 mL.
- Mostrar denegaciones: VENTAS no completa producción; COMPRAS no finaliza huellas;
  PRODUCCION no crea factores ADMIN-only.
- Auditoría selectiva: confirmación/recepción, producción completada, aprobación,
  finalización de huella y confirmación/despacho, vinculados a sus usuarios reales.
- La salida del E2E imprime IDs de evidencia, sin cookies ni secretos.
