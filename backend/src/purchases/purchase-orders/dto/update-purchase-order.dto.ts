import { PartialType } from '@nestjs/swagger';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto.js';
export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto, {
  skipNullProperties: false,
}) {}
