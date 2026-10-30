import { Module } from '@nestjs/common';

import { MqttService } from './mqtt/mqtt.service.js';
import { TelemetryIngestionService } from './readings/telemetry-ingestion.service.js';
import { RuleEngineService } from './rules/rule-engine.service.js';

@Module({ providers: [MqttService, TelemetryIngestionService, RuleEngineService] })
export class IiotModule {}
