import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RoleEntity } from '../entities/role.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { Permission } from '../enums/permission.enum';

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 300_000;

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,

    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private cacheKey(roleName: string): string {
    return `role:permissions:${roleName}`;
  }

  /**
   * Returns the list of permissions assigned to a role.
   * Results are cached in Redis (or in-memory) with a 5-minute TTL so that
   * the database is not hit on every request.
   */
  async getPermissionsForRole(roleName: string): Promise<Permission[]> {
    const key = this.cacheKey(roleName);

    const cached = await this.cacheManager.get<Permission[]>(key);
    if (cached) {
      this.logger.debug(`Cache hit for role '${roleName}'`);
      return cached;
    }

    this.logger.debug(`Cache miss for role '${roleName}', loading from DB`);

    const role = await this.roleRepo.findOne({
      where: { name: roleName },
      relations: ['rolePermissions'],
    });

    if (!role) {
      this.logger.warn(`Role '${roleName}' not found in database`);
      return [];
    }

    const permissions = role.rolePermissions.map(
      (rp) => rp.permission as Permission,
    );

    await this.cacheManager.set(key, permissions, CACHE_TTL_MS);
    return permissions;
  }

  /**
   * Removes the cached permission list for a role.
   * Call this after updating a role's permissions in the DB.
   */
  async invalidateRoleCache(roleName: string): Promise<void> {
    await this.cacheManager.del(this.cacheKey(roleName));
    this.logger.log(`Cache invalidated for role '${roleName}'`);
  }

  /** Seed helper — creates a role with its permissions if it doesn't exist. */
  async upsertRole(
    name: string,
    permissions: Permission[],
    description?: string,
  ): Promise<RoleEntity> {
    let role = await this.roleRepo.findOne({
      where: { name },
      relations: ['rolePermissions'],
    });

    if (!role) {
      role = this.roleRepo.create({ name, description: description ?? null });
      role = await this.roleRepo.save(role);
    }

    // Sync permissions
    await this.rolePermissionRepo.delete({ roleId: role.id });
    const perms = permissions.map((p) =>
      this.rolePermissionRepo.create({ roleId: role!.id, permission: p }),
    );
    await this.rolePermissionRepo.save(perms);

    await this.invalidateRoleCache(name);
    return role;
  }
}
