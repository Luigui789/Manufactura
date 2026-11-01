import { Module } from '@nestjs/common';

import { MqttService } from './mqtt/mqtt.service.js';
import { TelemetryIngestionService } from './readings/telemetry-ingestion.service.js';
import { RuleEngineService } from './rules/rule-engine.service.js';
import { MonitoringController } from './monitoring/monitoring.controller.js';
import { MonitoringService } from './monitoring/monitoring.service.js';
import { SimulationController } from './simulation/simulation.controller.js';
import { SimulationService } from './simulation/simulation.service.js';
import { SimulatorRunner } from './simulation/simulator-runner.service.js';

@Module({
  controllers: [MonitoringController, SimulationController],
  providers: [
    MqttService,
    TelemetryIngestionService,
    RuleEngineService,
    MonitoringService,
    SimulationService,
    SimulatorRunner,
  ],
})
export class IiotModule {}
