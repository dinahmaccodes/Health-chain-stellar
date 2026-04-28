import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  ValidationPipe,
} from '@nestjs/common';

import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

import { CreateIncidentReviewDto } from './dto/create-incident-review.dto';
import { QueryIncidentReviewDto } from './dto/query-incident-review.dto';
import { UpdateIncidentReviewDto } from './dto/update-incident-review.dto';
import { IncidentReviewsService } from './incident-reviews.service';

@Controller('incident-reviews')
export class IncidentReviewsController {
  constructor(private readonly service: IncidentReviewsService) {}

  @Post()
  @RequirePermissions(Permission.CREATE_INCIDENT_REVIEW)
  create(@Body() dto: CreateIncidentReviewDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id ?? req.user?.sub ?? 'unknown');
  }

  @Get()
  @RequirePermissions(Permission.VIEW_INCIDENT_REVIEWS)
  findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: QueryIncidentReviewDto,
    @Request() req: any,
  ) {
    return this.service.findAll(query, {
      userId: req.user?.id ?? req.user?.sub ?? 'unknown',
      role: req.user?.role,
      organizationId: req.user?.organizationId ?? null,
    });
  }

  @Get('stats')
  @RequirePermissions(Permission.VIEW_INCIDENT_REVIEWS)
  getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('riderId') riderId?: string,
    @Query('hospitalId') hospitalId?: string,
    @Request() req?: any,
  ) {
    return this.service.getStats({
      startDate,
      endDate,
      riderId,
      hospitalId,
      actor: {
        userId: req?.user?.id ?? req?.user?.sub ?? 'unknown',
        role: req?.user?.role,
        organizationId: req?.user?.organizationId ?? null,
      },
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.VIEW_INCIDENT_REVIEWS)
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, {
      userId: req.user?.id ?? req.user?.sub ?? 'unknown',
      role: req.user?.role,
      organizationId: req.user?.organizationId ?? null,
    });
  }

  @Patch(':id')
  @RequirePermissions(Permission.MANAGE_INCIDENT_REVIEWS)
  update(@Param('id') id: string, @Body() dto: UpdateIncidentReviewDto, @Request() req: any) {
    return this.service.update(id, dto, {
      userId: req.user?.id ?? req.user?.sub ?? 'unknown',
      role: req.user?.role,
      organizationId: req.user?.organizationId ?? null,
    });
  }
}
