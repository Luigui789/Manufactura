import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type MqttClient } from 'mqtt';

import { TelemetryIngestionService } from '../readings/telemetry-ingestion.service.js';
import { parseTelemetry } from './mqtt-message.parser.js';
import { TELEMETRY_TOPIC, TelemetryRejectedError } from './mqtt-message.types.js';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client?: MqttClient;
  private stopping = false;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly config: ConfigService,
    private readonly ingestion: TelemetryIngestionService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    const client = connect(this.config.getOrThrow<string>('MQTT_URL'), {
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 5000,
      resubscribe: false,
      // Telemetry QoS 0 is disposable; do not buffer publishes while offline.
      queueQoSZero: false,
    });
    this.client = client;
    client.on('connect', () => {
      this.logger.log('MQTT connected');
      client.subscribe(TELEMETRY_TOPIC, { qos: 0 }, (error, grants) => {
        if (error || !grants?.length || grants.some((grant) => grant.qos === 128)) {
          this.logger.error('MQTT subscription failed');
          return;
        }
        this.logger.log(`MQTT subscribed to ${TELEMETRY_TOPIC}`);
      });
    });
    client.on('close', () => {
      if (!this.stopping) this.logger.log('MQTT disconnected');
    });
    client.on('reconnect', () => this.logger.log('MQTT reconnecting'));
    // Never include the URL or a broker error that might contain credentials.
    client.on('error', () => this.logger.error('MQTT connection error'));
    client.on('message', this.onMessage);
  }

  private readonly onMessage = (topic: string, payload: Buffer): void => {
    if (this.stopping) return;
    const task = this.processMessage(topic, payload);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  };

  private async processMessage(topic: string, payload: Buffer): Promise<void> {
    try {
      await this.ingestion.ingest(parseTelemetry(topic, payload));
    } catch (error) {
      if (error instanceof TelemetryRejectedError)
        this.logger.warn(`MQTT message rejected: ${error.message}`);
      else this.logger.error('MQTT telemetry persistence failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.client) {
      this.client.off('message', this.onMessage);
      await this.client.endAsync(true);
    }
    await Promise.all(this.pending);
  }
}
