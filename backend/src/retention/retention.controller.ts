import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { RetentionService } from './retention.service';

@ApiTags('Retention')
@Controller('retention')
@UseGuards(JwtAuthGuard)
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Post('trigger')
  @RequirePermissions(Permission.ADMIN_ACCESS)
  @ApiOperation({
    summary: 'Manually trigger retention job',
    description: 'Cleans up stale sessions and old activity logs. Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Retention job completed successfully',
    schema: {
      example: {
        sessionsDeleted: 42,
        logsDeleted: 156,
      },
    },
  })
  async triggerRetention() {
    return this.retentionService.triggerRetention();
  }
}
