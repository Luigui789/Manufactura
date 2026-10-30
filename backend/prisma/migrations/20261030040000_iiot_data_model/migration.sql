-- Additive phase: existing production, inventory and quality rows are untouched.
BEGIN;

-- CreateEnum
CREATE TYPE "IiotMetric" AS ENUM ('TEMPERATURE', 'HUMIDITY', 'PH', 'TANK_LEVEL', 'MIXER_RPM');

-- CreateEnum
CREATE TYPE "IiotAlertSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "iiot_devices" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "iiot_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iiot_readings" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "metric" "IiotMetric" NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iiot_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iiot_alerts" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "reading_id" UUID,
    "type" VARCHAR(80) NOT NULL,
    "severity" "IiotAlertSeverity" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "iiot_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iiot_devices_code_key" ON "iiot_devices"("code");

-- CreateIndex
CREATE INDEX "iiot_readings_production_order_id_recorded_at_idx" ON "iiot_readings"("production_order_id", "recorded_at");

-- CreateIndex
CREATE INDEX "iiot_readings_production_order_id_metric_recorded_at_idx" ON "iiot_readings"("production_order_id", "metric", "recorded_at");

-- CreateIndex
CREATE INDEX "iiot_readings_device_id_recorded_at_idx" ON "iiot_readings"("device_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "iiot_readings_id_production_order_id_key" ON "iiot_readings"("id", "production_order_id");

-- CreateIndex
CREATE INDEX "iiot_alerts_production_order_id_created_at_idx" ON "iiot_alerts"("production_order_id", "created_at");

-- CreateIndex
CREATE INDEX "iiot_alerts_reading_id_production_order_id_idx" ON "iiot_alerts"("reading_id", "production_order_id");

-- AddForeignKey
ALTER TABLE "iiot_readings" ADD CONSTRAINT "iiot_readings_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iiot_readings" ADD CONSTRAINT "iiot_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "iiot_devices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iiot_alerts" ADD CONSTRAINT "iiot_alerts_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "iiot_alerts" ADD CONSTRAINT "iiot_alerts_reading_order_fkey" FOREIGN KEY ("reading_id", "production_order_id") REFERENCES "iiot_readings"("id", "production_order_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma does not express CHECK constraints. No process thresholds are enforced here.
ALTER TABLE "iiot_devices"
  ADD CONSTRAINT "iiot_devices_code_nonempty_check" CHECK (btrim("code") <> ''),
  ADD CONSTRAINT "iiot_devices_name_nonempty_check" CHECK (btrim("name") <> '');
ALTER TABLE "iiot_readings"
  ADD CONSTRAINT "iiot_readings_unit_nonempty_check" CHECK (btrim("unit") <> ''),
  ADD CONSTRAINT "iiot_readings_value_finite_check" CHECK ("value" <> 'NaN'::numeric);
ALTER TABLE "iiot_alerts"
  ADD CONSTRAINT "iiot_alerts_type_nonempty_check" CHECK (btrim("type") <> ''),
  ADD CONSTRAINT "iiot_alerts_message_nonempty_check" CHECK (btrim("message") <> '');

COMMIT;
