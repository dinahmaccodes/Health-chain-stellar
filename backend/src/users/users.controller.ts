import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(Permission.MANAGE_USERS)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('profile')
  @RequirePermissions(Permission.READ_USER)
  getProfile(@Request() req: any) {
    return this.usersService.getProfile(req.user?.id ?? 'user-id-placeholder');
  }

  @Get(':id')
  @RequirePermissions(Permission.READ_USER)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.UPDATE_USER)
  update(@Param('id') id: string, @Body() updateUserDto: any) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
