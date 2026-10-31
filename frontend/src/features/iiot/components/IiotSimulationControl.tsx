import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FormSection, LoadingState } from '@/components/erp';
import { useSimulation, useStartSimulation, type SimulationOptions } from '../api/simulation';

export function IiotSimulationControl({ productionOrderId }: { productionOrderId: string }) {
  const run = useSimulation(productionOrderId);
  const start = useStartSimulation(productionOrderId);
  const submitting = useRef(false);
  const [process, setProcess] = useState<SimulationOptions['process']>('liquid');
  const [scenario, setScenario] = useState<SimulationOptions['scenario']>('deviation');
  const running = run.data?.status === 'RUNNING';
  const disabled =
    start.isPending ||
    running ||
    !run.data?.available ||
    run.data?.orderStatus !== 'IN_PROGRESS' ||
    run.isError;
  return (
    <FormSection
      title="Prueba IIoT"
      description="DEMO / SYNTHETIC · Generá telemetría simulada sin usar la terminal."
    >
      <p className="text-sm text-muted-foreground">
        La prueba prepara un dispositivo y publica 60 muestras durante aproximadamente un minuto.
        Mantené la OP en curso hasta que termine. Completar producción e inspeccionar Calidad siguen
        siendo decisiones tuyas.
      </p>
      {run.isPending && <LoadingState label="Consultando prueba IIoT…" />}
      <ErrorNotice error={run.error} />
      <ErrorNotice error={start.error} />
      {run.isError && (
        <Button variant="outline" onClick={() => void run.refetch()}>
          Reintentar consulta de prueba
        </Button>
      )}
      {run.data && !run.data.available && (
        <p className="text-sm">El simulador de demostración no está disponible en este entorno.</p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Proceso de demo
          <select
            value={process}
            disabled={disabled}
            onChange={(event) => setProcess(event.target.value as SimulationOptions['process'])}
          >
            <option value="liquid">Jabón líquido</option>
            <option value="bar">Jabón en barra</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Escenario
          <select
            value={scenario}
            disabled={disabled}
            onChange={(event) => setScenario(event.target.value as SimulationOptions['scenario'])}
          >
            <option value="deviation">Con desviaciones (WARNING / CRITICAL)</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <Button
          disabled={disabled}
          onClick={() => {
            if (submitting.current) return;
            submitting.current = true;
            start.mutate(
              { process, scenario },
              {
                onSettled: () => {
                  submitting.current = false;
                },
              },
            );
          }}
        >
          {start.isPending
            ? 'Preparando prueba…'
            : running
              ? 'Prueba en curso…'
              : 'Iniciar prueba IIoT'}
        </Button>
        <Button asChild variant="outline">
          <Link to={'/production/orders/' + productionOrderId + '/iiot'}>Ver monitoreo IIoT</Link>
        </Button>
      </div>
      {run.data && run.data.status !== 'IDLE' && (
        <div role="status" aria-live="polite" className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {running
              ? 'Prueba en curso'
              : run.data.status === 'COMPLETED'
                ? 'Prueba finalizada: lecturas recibidas'
                : 'La prueba no se completó'}
          </p>
          <p>
            {run.data.process === 'bar' ? 'Barra' : 'Líquido'} ·{' '}
            {run.data.scenario === 'normal' ? 'Normal' : 'Con desviaciones'}
          </p>
          <progress
            aria-label="Muestras publicadas"
            value={run.data.publishedSamples}
            max={run.data.totalSamples}
            className="w-full"
          />
          <p>
            {run.data.publishedSamples} de {run.data.totalSamples} muestras publicadas ·{' '}
            {run.data.receivedReadings} lecturas recibidas
          </p>
          {run.data.deviceCode && <p className="break-words">Dispositivo: {run.data.deviceCode}</p>}
          {run.data.error && <p>{run.data.error}</p>}
        </div>
      )}
    </FormSection>
  );
}
