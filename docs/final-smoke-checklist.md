# Smoke manual final — 10–15 minutos

Partir de demo READY con servicios healthy. Usar la contraseña temporal del
[runbook](defense-runbook.md). Registrar números/IDs en las evidencias de la defensa,
sin cookies ni secretos. Este smoke consume datos; no sustituye C6.

- [ ] **0–1 min / login:** entrar como COMPRAS. Una cookie ausente redirige a login;
      cada cuenta ve acciones de su rol. Proveedor SUP-ACU-001 disponible.
- [ ] **1–3 min / compra:** crear y confirmar OC de MP-ACU, 10000 mL, precio
      ilustrativo 1. Recibir en ALM-PRINCIPAL; mostrar comprobante y lote.
- [ ] **3–4 min / inventario:** como INVENTARIO, consultar saldo 10000 mL y lote.
      Comprobar filtros, carga, vacío y mensaje de error/reintento si procede.
- [ ] **4–6 min / producción:** como PRODUCCION, crear INT-ACU-FIL 5000 mL,
      mostrar requirements, iniciar/completar asignando el lote crudo.
      Mostrar lote RELEASED y trazabilidad. Crear PT-JABON-500 10 UNIT e iniciar.
- [ ] **6–8 min / IIoT:** iniciar bar/normal y abrir monitoreo por su URL.
      Confirmar dispositivo y lecturas; sin alerta también es válido. El botón
      queda bloqueado durante la petición/ejecución. No es necesario esperar desviación.
- [ ] **8–10 min / calidad:** completar 10 UNIT con el lote filtrado. Ver
      QUARANTINED, aprobar y mostrar RELEASED; botón de inspección deja de ofrecerse.
- [ ] **10–12 min / sostenibilidad:** crear DRAFT, mostrar cuatro materiales,
      snapshots, missingFactors vacío y 5 L de aceite valorizado aparte del carbono.
      Agregar 5 kWh de energía manual; revisar preview y notas antes de finalizar.
- [ ] **12–14 min / ventas:** como VENTAS, crear/confirmar orden de 5 UNIT para
      CLI-VERDE-001, revisar y despachar desde lote aprobado. Saldo principal 5 UNIT.
- [ ] **14–15 min / dashboard:** abrir Producción como ADMIN, filtrar producto barra,
      mostrar OP completada y cantidades en UNIT. Refresh directo de detalles funciona.

Criterio: ninguna pantalla rota, errores claros, acciones sensibles requieren
revisión y quedan bloqueadas durante submit; controles respetan rol/estado.
Los tests de regresión cubren carreras y negativos; no provocarlos manualmente en
la base preparada para la defensa. Finalizar con demo:verify NOT READY por uso,
ledger inicial PASS, y recuperar manualmente si se necesita otro ensayo limpio.
