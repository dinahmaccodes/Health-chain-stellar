import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Permission } from '../enums/permission.enum';
import { RolesService } from '../services/roles.service';

/**
 * Global authorization guard that enforces fine-grained permission checks.
 *
 * Pipeline:
 * 1. Skip if `@Public()` is present (already passed JwtAuthGuard).
 * 2. If no `@RequirePermissions()` metadata is found, allow any authenticated user.
 * 3. Load the user's role permissions from cache (Redis) → DB fallback.
 * 4. Throw a structured 403 if ANY required permission is missing, including
 *    the `requiredPermission` field in the response body.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Routes marked @Public() bypass this guard too.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermissions() annotation — only authentication is required.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'User not authenticated',
        error: 'Unauthorized',
      });
    }

    if (!user.role) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'User has no role assigned',
        error: 'Forbidden',
        requiredPermission: requiredPermissions[0],
      });
    }

    const userPermissions = await this.rolesService.getPermissionsForRole(
      user.role,
    );

    const missingPermission = requiredPermissions.find(
      (perm) => !userPermissions.includes(perm),
    );

    if (missingPermission) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Access denied. Insufficient permissions.',
        error: 'Forbidden',
        requiredPermission: missingPermission,
      });
    }

    return true;
  }
}
