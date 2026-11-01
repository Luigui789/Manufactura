import { Injectable } from '@nestjs/common';

import { IiotAlertSeverity, Prisma, type IiotReading } from '../../generated/prisma/client.js';
import { DEMO_RULES } from './demo-rules.js';

export type AlertDecision = {
  type: string;
  severity: IiotAlertSeverity;
  message: string;
};

@Injectable()
export class RuleEngineService {
  evaluate(reading: Pick<IiotReading, 'metric' | 'value' | 'unit'>): AlertDecision | null {
    const rule = DEMO_RULES[reading.metric];
    if (reading.unit !== rule.unit) return null;
    for (const severity of [IiotAlertSeverity.CRITICAL, IiotAlertSeverity.WARNING]) {
      const bounds = severity === IiotAlertSeverity.CRITICAL ? rule.critical : rule.warning;
      const side = reading.value.lte(bounds[0]) ? 0 : reading.value.gte(bounds[1]) ? 1 : null;
      if (side === null) continue;
      const threshold = new Prisma.Decimal(bounds[side]).toFixed(4);
      return {
        type: rule.types[side],
        severity,
        message: `${reading.metric} ${reading.value.toFixed(4)} ${reading.unit} is ${side === 0 ? 'at or below' : 'at or above'} demo ${severity.toLowerCase()} ${side === 0 ? 'minimum' : 'maximum'} ${threshold} ${reading.unit}`,
      };
    }
    return null;
  }
}
