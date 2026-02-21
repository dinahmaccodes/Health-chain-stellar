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
  Request,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions(Permission.READ_ORDER)
  findAll(
    @Query('status') status?: string,
    @Query('hospitalId') hospitalId?: string,
  ) {
    return this.ordersService.findAll(status, hospitalId);
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_ORDER)
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  /**
   * GET /orders/:id/history
   * Returns the full, chronologically-ordered event log for an order.
   * Each row contains: order_id, event_type, payload, actor_id, timestamp.
   */
  @Get(':id/history')
  @RequirePermissions(Permission.READ_ORDER)
  getOrderHistory(@Param('id') id: string) {
    return this.ordersService.getOrderHistory(id);
  }

  @Get(':id/track')
  @RequirePermissions(Permission.READ_ORDER)
  trackOrder(@Param('id') id: string) {
    return this.ordersService.trackOrder(id);
  }

  @Post()
  @RequirePermissions(Permission.CREATE_ORDER)
  create(@Body() createOrderDto: any, @Request() req: any) {
    const actorId: string | undefined = req.user?.id;
    return this.ordersService.create(createOrderDto, actorId);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UPDATE_ORDER)
  update(@Param('id') id: string, @Body() updateOrderDto: any) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.UPDATE_ORDER)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req: any,
  ) {
    const actorId: string | undefined = req.user?.id;
    return this.ordersService.updateStatus(id, status, actorId);
  }

  @Patch(':id/assign-rider')
  @RequirePermissions(Permission.MANAGE_RIDERS)
  assignRider(
    @Param('id') id: string,
    @Body('riderId') riderId: string,
    @Request() req: any,
  ) {
    const actorId: string | undefined = req.user?.id;
    return this.ordersService.assignRider(id, riderId, actorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.CANCEL_ORDER)
  remove(@Param('id') id: string, @Request() req: any) {
    const actorId: string | undefined = req.user?.id;
    return this.ordersService.remove(id, actorId);
  }
}