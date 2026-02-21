import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions(Permission.READ_INVENTORY)
  findAll(@Query('hospitalId') hospitalId?: string) {
    return this.inventoryService.findAll(hospitalId);
  }

  @Get('low-stock')
  @RequirePermissions(Permission.READ_INVENTORY)
  getLowStock(@Query('threshold') threshold: string = '10') {
    return this.inventoryService.getLowStockItems(parseInt(threshold, 10));
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_INVENTORY)
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.CREATE_INVENTORY)
  create(@Body() createInventoryDto: any) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UPDATE_INVENTORY)
  update(@Param('id') id: string, @Body() updateInventoryDto: any) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Patch(':id/stock')
  @RequirePermissions(Permission.UPDATE_INVENTORY)
  updateStock(@Param('id') id: string, @Body('quantity') quantity: number) {
    return this.inventoryService.updateStock(id, quantity);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.DELETE_INVENTORY)
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
