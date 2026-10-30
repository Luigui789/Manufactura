import { Module } from '@nestjs/common';

import { MqttService } from './mqtt/mqtt.service.js';
import { TelemetryIngestionService } from './readings/telemetry-ingestion.service.js';

@Module({ providers: [MqttService, TelemetryIngestionService] })
export class IiotModule {}
