import { PartialType } from '@nestjs/swagger';
import { CreateSupplierDto } from './create-suplier.dto.js';

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
