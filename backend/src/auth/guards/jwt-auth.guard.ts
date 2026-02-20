import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global JWT authentication guard.
 *
 * Behaviour:
 * - Routes decorated with `@Public()` are skipped entirely.
 * - All other routes require a valid, non-expired Bearer token.
 * - An invalid/expired token returns a structured 401 response.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
  ): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid or expired token',
          error: 'Unauthorized',
        })
      );
    }
    return user as TUser;
  }
}
