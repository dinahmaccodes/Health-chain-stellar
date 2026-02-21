import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { BloodUnitsService } from './blood-units.service';
import {
  RegisterBloodUnitDto,
  TransferCustodyDto,
  LogTemperatureDto,
} from './dto/blood-units.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('blood-units')
export class BloodUnitsController {
  constructor(private readonly bloodUnitsService: BloodUnitsService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.REGISTER_BLOOD_UNIT)
  async registerBloodUnit(@Body() dto: RegisterBloodUnitDto) {
    return this.bloodUnitsService.registerBloodUnit(dto);
  }

  @Post('transfer-custody')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.TRANSFER_BLOOD_CUSTODY)
  async transferCustody(@Body() dto: TransferCustodyDto) {
    return this.bloodUnitsService.transferCustody(dto);
  }

  @Post('log-temperature')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.REGISTER_BLOOD_UNIT)
  async logTemperature(@Body() dto: LogTemperatureDto) {
    return this.bloodUnitsService.logTemperature(dto);
  }

  @Get(':id/trail')
  @RequirePermissions(Permission.VIEW_BLOODUNIT_TRAIL)
  async getUnitTrail(@Param('id', ParseIntPipe) id: number) {
    return this.bloodUnitsService.getUnitTrail(id);
  }
}

@Controller('blood-units')
export class BloodUnitsController {
  constructor(private readonly bloodUnitsService: BloodUnitsService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerBloodUnit(@Body() dto: RegisterBloodUnitDto) {
    return this.bloodUnitsService.registerBloodUnit(dto);
  }

  @Post('transfer-custody')
  @HttpCode(HttpStatus.OK)
  async transferCustody(@Body() dto: TransferCustodyDto) {
    return this.bloodUnitsService.transferCustody(dto);
  }

  @Post('log-temperature')
  @HttpCode(HttpStatus.OK)
  async logTemperature(@Body() dto: LogTemperatureDto) {
    return this.bloodUnitsService.logTemperature(dto);
  }

  @Get(':id/trail')
  async getUnitTrail(@Param('id', ParseIntPipe) id: number) {
    return this.bloodUnitsService.getUnitTrail(id);
  }
}
