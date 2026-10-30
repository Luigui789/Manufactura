import { Module } from '@nestjs/common';

import { MqttService } from './mqtt/mqtt.service.js';
import { TelemetryIngestionService } from './readings/telemetry-ingestion.service.js';
import { RuleEngineService } from './rules/rule-engine.service.js';
import { MonitoringController } from './monitoring/monitoring.controller.js';
import { MonitoringService } from './monitoring/monitoring.service.js';

@Module({
  controllers: [MonitoringController],
  providers: [MqttService, TelemetryIngestionService, RuleEngineService, MonitoringService],
})
export class IiotModule {}
