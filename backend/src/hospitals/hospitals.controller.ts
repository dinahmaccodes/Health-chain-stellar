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
import { HospitalsService } from './hospitals.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get()
  @RequirePermissions(Permission.READ_HOSPITAL)
  findAll() {
    return this.hospitalsService.findAll();
  }

  @Get('nearby')
  @RequirePermissions(Permission.READ_HOSPITAL)
  getNearby(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('radius') radius: string = '10',
  ) {
    return this.hospitalsService.getNearbyHospitals(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(radius),
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_HOSPITAL)
  findOne(@Param('id') id: string) {
    return this.hospitalsService.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.CREATE_HOSPITAL)
  create(@Body() createHospitalDto: any) {
    return this.hospitalsService.create(createHospitalDto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UPDATE_HOSPITAL)
  update(@Param('id') id: string, @Body() updateHospitalDto: any) {
    return this.hospitalsService.update(id, updateHospitalDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.DELETE_HOSPITAL)
  remove(@Param('id') id: string) {
    return this.hospitalsService.remove(id);
  }
}
