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
import { RidersService } from './riders.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('riders')
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  @Get()
  @RequirePermissions(Permission.READ_RIDER)
  findAll(@Query('status') status?: string) {
    return this.ridersService.findAll(status);
  }

  @Get('available')
  @RequirePermissions(Permission.READ_RIDER)
  getAvailable() {
    return this.ridersService.getAvailableRiders();
  }

  @Get('nearby')
  @RequirePermissions(Permission.READ_RIDER)
  getNearby(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radius') radius: string = '10',
  ) {
    return this.ridersService.getNearbyRiders(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(radius),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_RIDER)
  findOne(@Param('id') id: string) {
    return this.ridersService.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.CREATE_RIDER)
  create(@Body() createRiderDto: any) {
    return this.ridersService.create(createRiderDto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UPDATE_RIDER)
  update(@Param('id') id: string, @Body() updateRiderDto: any) {
    return this.ridersService.update(id, updateRiderDto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.MANAGE_RIDERS)
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.ridersService.updateStatus(id, status);
  }

  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @Body('latitude') latitude: number,
    @Body('longitude') longitude: number,
  ) {
    return this.ridersService.updateLocation(id, latitude, longitude);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.ridersService.remove(id);
  }
}
