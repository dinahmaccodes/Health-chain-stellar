import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RedisModule } from '../redis/redis.module';
import { UserActivityEntity } from '../user-activity/entities/user-activity.entity';

import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserActivityEntity]), RedisModule],
  providers: [RetentionService],
  controllers: [RetentionController],
  exports: [RetentionService],
})
export class RetentionModule {}
