import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PermissionsGuard } from './guards/permissions.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesService } from './services/roles.service';
import { RoleEntity } from './entities/role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { Permission } from './enums/permission.enum';
import { Role } from './enums/role.enum';
import { PERMISSIONS_KEY } from './decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildContext(overrides: {
  user?: any;
  handlerPermissions?: Permission[];
  classPermissions?: Permission[];
  isPublic?: boolean;
}): ExecutionContext {
  const mockHandler = jest.fn();
  const mockClass = jest.fn();

  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return overrides.isPublic ?? false;
      if (key === PERMISSIONS_KEY)
        return overrides.handlerPermissions ?? overrides.classPermissions ?? [];
      return undefined;
    }),
  } as unknown as Reflector;

  const ctx = {
    getHandler: () => mockHandler,
    getClass: () => mockClass,
    switchToHttp: () => ({
      getRequest: () => ({ user: overrides.user }),
    }),
    _reflector: reflector,
  } as unknown as ExecutionContext;

  return ctx;
}

// ─── RolesService tests ──────────────────────────────────────────────────────

describe('RolesService', () => {
  let service: RolesService;

  const mockRoleRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockRolePermissionRepo = {
    delete: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(RoleEntity), useValue: mockRoleRepo },
        {
          provide: getRepositoryToken(RolePermissionEntity),
          useValue: mockRolePermissionRepo,
        },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
  });

  describe('getPermissionsForRole', () => {
    it('returns permissions from cache on cache hit', async () => {
      const cached = [Permission.READ_ORDER, Permission.CREATE_ORDER];
      mockCache.get.mockResolvedValue(cached);

      const result = await service.getPermissionsForRole(Role.HOSPITAL);

      expect(result).toEqual(cached);
      expect(mockRoleRepo.findOne).not.toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalledWith('role:permissions:HOSPITAL');
    });

    it('loads from DB and populates cache on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRoleRepo.findOne.mockResolvedValue({
        id: 'role-1',
        name: Role.ADMIN,
        rolePermissions: [
          { permission: Permission.CREATE_ORDER },
          { permission: Permission.MANAGE_USERS },
        ],
      });

      const result = await service.getPermissionsForRole(Role.ADMIN);

      expect(result).toEqual([Permission.CREATE_ORDER, Permission.MANAGE_USERS]);
      expect(mockCache.set).toHaveBeenCalledWith(
        'role:permissions:ADMIN',
        [Permission.CREATE_ORDER, Permission.MANAGE_USERS],
        300_000,
      );
    });

    it('returns empty array when role is not found in DB', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRoleRepo.findOne.mockResolvedValue(null);

      const result = await service.getPermissionsForRole('UNKNOWN_ROLE');

      expect(result).toEqual([]);
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('returns empty array for a role with no permissions', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRoleRepo.findOne.mockResolvedValue({
        id: 'role-2',
        name: Role.DONOR,
        rolePermissions: [],
      });

      const result = await service.getPermissionsForRole(Role.DONOR);

      expect(result).toEqual([]);
    });
  });

  describe('invalidateRoleCache', () => {
    it('deletes the correct cache key', async () => {
      await service.invalidateRoleCache(Role.ADMIN);
      expect(mockCache.del).toHaveBeenCalledWith('role:permissions:ADMIN');
    });
  });
});

// ─── PermissionsGuard tests ─────────────────────────────────────────────────

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let rolesService: RolesService;

  const mockRolesService = {
    getPermissionsForRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        { provide: RolesService, useValue: mockRolesService },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
    rolesService = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
  });

  function makeCtx(
    user: any,
    requiredPerms: Permission[],
    isPublic = false,
  ): ExecutionContext {
    const reflectorSpy = reflector.getAllAndOverride as jest.Mock;
    reflectorSpy.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return isPublic;
      if (key === PERMISSIONS_KEY) return requiredPerms;
      return undefined;
    });

    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  // ── Public routes ───────────────────────────────────────────────────────
  it('allows public routes without checking permissions', async () => {
    const ctx = makeCtx(undefined, [], true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockRolesService.getPermissionsForRole).not.toHaveBeenCalled();
  });

  // ── No @RequirePermissions ──────────────────────────────────────────────
  it('allows authenticated requests with no @RequirePermissions annotation', async () => {
    const ctx = makeCtx({ id: '1', role: Role.HOSPITAL }, []);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Valid permissions ───────────────────────────────────────────────────
  it('allows access when user has the required permission', async () => {
    mockRolesService.getPermissionsForRole.mockResolvedValue([
      Permission.READ_ORDER,
      Permission.CREATE_ORDER,
    ]);
    const ctx = makeCtx(
      { id: '1', role: Role.HOSPITAL },
      [Permission.READ_ORDER],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows access when user has ALL required permissions', async () => {
    mockRolesService.getPermissionsForRole.mockResolvedValue([
      Permission.READ_ORDER,
      Permission.CREATE_ORDER,
      Permission.CANCEL_ORDER,
    ]);
    const ctx = makeCtx(
      { id: '1', role: Role.HOSPITAL },
      [Permission.READ_ORDER, Permission.CREATE_ORDER],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows ADMIN with full permission set', async () => {
    const allPerms = Object.values(Permission);
    mockRolesService.getPermissionsForRole.mockResolvedValue(allPerms);
    const ctx = makeCtx(
      { id: 'admin-1', role: Role.ADMIN },
      [Permission.MANAGE_SYSTEM, Permission.MANAGE_ROLES],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ── Missing permissions — structured 403 ───────────────────────────────
  it('throws ForbiddenException with requiredPermission when permission is missing', async () => {
    mockRolesService.getPermissionsForRole.mockResolvedValue([
      Permission.READ_ORDER,
    ]);
    const ctx = makeCtx(
      { id: '1', role: Role.DONOR },
      [Permission.CREATE_ORDER],
    );

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    try {
      await guard.canActivate(ctx);
    } catch (err) {
      const ex = err as ForbiddenException;
      const body = ex.getResponse() as any;
      expect(body.requiredPermission).toBe(Permission.CREATE_ORDER);
      expect(body.statusCode).toBe(403);
      expect(body.error).toBe('Forbidden');
    }
  });

  it('throws ForbiddenException when user has none of the required permissions', async () => {
    mockRolesService.getPermissionsForRole.mockResolvedValue([]);
    const ctx = makeCtx(
      { id: '1', role: Role.RIDER },
      [Permission.MANAGE_USERS],
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when user has partial permissions (needs ALL)', async () => {
    mockRolesService.getPermissionsForRole.mockResolvedValue([
      Permission.READ_ORDER,
    ]);
    const ctx = makeCtx(
      { id: '1', role: Role.HOSPITAL },
      [Permission.READ_ORDER, Permission.DELETE_HOSPITAL],
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  // ── Missing user ────────────────────────────────────────────────────────
  it('throws UnauthorizedException when req.user is undefined', async () => {
    const ctx = makeCtx(undefined, [Permission.CREATE_ORDER]);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // ── Missing role on user ────────────────────────────────────────────────
  it('throws ForbiddenException with requiredPermission when user has no role', async () => {
    const ctx = makeCtx(
      { id: '1', email: 'test@test.com' /* no role */ },
      [Permission.CREATE_ORDER],
    );

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    try {
      await guard.canActivate(ctx);
    } catch (err) {
      const ex = err as ForbiddenException;
      const body = ex.getResponse() as any;
      expect(body.requiredPermission).toBe(Permission.CREATE_ORDER);
    }
  });

  // ── Role not found in DB ────────────────────────────────────────────────
  it('throws ForbiddenException when role returns empty permissions (role not in DB)', async () => {
    mockRolesService.getPermissionsForRole.mockResolvedValue([]);
    const ctx = makeCtx(
      { id: '1', role: 'GHOST_ROLE' },
      [Permission.READ_ORDER],
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

// ─── JwtAuthGuard tests ──────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get<Reflector>(Reflector);
    jest.clearAllMocks();
  });

  function makeJwtCtx(isPublic: boolean): ExecutionContext {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(isPublic);
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  it('returns true immediately for @Public() routes', () => {
    const ctx = makeJwtCtx(true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('delegates to Passport AuthGuard for non-public routes (calls super)', () => {
    const ctx = makeJwtCtx(false);
    // spy on the super class canActivate to confirm delegation
    const superSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true as any);
    guard.canActivate(ctx);
    expect(superSpy).toHaveBeenCalledWith(ctx);
    superSpy.mockRestore();
  });

  it('handleRequest returns user when valid', () => {
    const user = { id: '1', role: Role.ADMIN };
    expect(guard.handleRequest(null, user, null)).toBe(user);
  });

  it('handleRequest throws UnauthorizedException when no user', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(
      UnauthorizedException,
    );
  });

  it('handleRequest re-throws the provided error', () => {
    const err = new UnauthorizedException('Token expired');
    expect(() => guard.handleRequest(err, null, null)).toThrow(err);
  });

  it('handleRequest returns a structured 401 body when token is missing', () => {
    try {
      guard.handleRequest(null, undefined, { message: 'No auth token' });
    } catch (err) {
      const ex = err as UnauthorizedException;
      const body = ex.getResponse() as any;
      expect(body.statusCode).toBe(401);
      expect(body.error).toBe('Unauthorized');
    }
  });

  it('handleRequest throws for an expired-token error passed as first arg', () => {
    const expiredErr = new UnauthorizedException('jwt expired');
    expect(() => guard.handleRequest(expiredErr, null, null)).toThrow(
      UnauthorizedException,
    );
  });

  it('handleRequest returns user even when info is non-null (valid token with extra info)', () => {
    const user = { id: '2', role: Role.HOSPITAL };
    expect(guard.handleRequest(null, user, { message: 'ok' })).toBe(user);
  });
});

// ─── Permission enum coverage ────────────────────────────────────────────────

describe('Permission enum', () => {
  it('covers all expected action categories', () => {
    const perms = Object.values(Permission);
    const categories = ['ORDER', 'HOSPITAL', 'RIDER', 'INVENTORY', 'BLOOD', 'USER', 'DISPATCH'];
    categories.forEach((cat) => {
      expect(perms.some((p) => p.includes(cat))).toBe(true);
    });
  });

  it('has admin-only permissions', () => {
    expect(Permission.MANAGE_ROLES).toBeDefined();
    expect(Permission.MANAGE_SYSTEM).toBeDefined();
    expect(Permission.VIEW_ANALYTICS).toBeDefined();
  });
});
