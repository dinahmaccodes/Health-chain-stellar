import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryStockEntity } from './entities/inventory-stock.entity';

const mockStock = (overrides: Partial<InventoryStockEntity> = {}): InventoryStockEntity =>
  ({
    id: 'stock-1',
    bloodBankId: 'BB-001',
    bloodType: 'O+',
    availableUnits: 5,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InventoryStockEntity);

describe('InventoryService – optimistic locking', () => {
  let service: InventoryService;
  let findOne: jest.Mock;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    findOne = jest.fn();
    qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(InventoryStockEntity),
          useValue: {
            findOne,
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn((dto) => dto),
            save: jest.fn((e) => Promise.resolve(e)),
            merge: jest.fn((e, u) => ({ ...e, ...u })),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(() => qb),
          },
        },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  describe('reserveStockOrThrow', () => {
    it('throws ConflictException when quantity is zero', async () => {
      await expect(service.reserveStockOrThrow('BB-001', 'O+', 0)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when no stock record exists', async () => {
      findOne.mockResolvedValue(null);
      await expect(service.reserveStockOrThrow('BB-001', 'O+', 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when available units are insufficient', async () => {
      findOne.mockResolvedValue(mockStock({ availableUnits: 0 }));
      await expect(service.reserveStockOrThrow('BB-001', 'O+', 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('succeeds when version matches and units are sufficient', async () => {
      findOne.mockResolvedValue(mockStock());
      qb.execute.mockResolvedValue({ affected: 1 });
      await expect(service.reserveStockOrThrow('BB-001', 'O+', 3)).resolves.toBeUndefined();
    });

    it('retries once on version mismatch then throws ConflictException', async () => {
      findOne.mockResolvedValue(mockStock());
      qb.execute.mockResolvedValue({ affected: 0 });
      await expect(service.reserveStockOrThrow('BB-001', 'O+', 1)).rejects.toThrow(
        ConflictException,
      );
      expect(findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('restoreStockOrThrow', () => {
    it('throws ConflictException when quantity is zero', async () => {
      await expect(service.restoreStockOrThrow('BB-001', 'O+', 0)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates a new stock record when none exists', async () => {
      findOne.mockResolvedValue(null);
      const repo = service['inventoryRepo'] as any;
      await expect(service.restoreStockOrThrow('BB-001', 'O+', 2)).resolves.toBeUndefined();
      expect(repo.save).toHaveBeenCalled();
    });

    it('succeeds when version matches', async () => {
      findOne.mockResolvedValue(mockStock());
      qb.execute.mockResolvedValue({ affected: 1 });
      await expect(service.restoreStockOrThrow('BB-001', 'O+', 2)).resolves.toBeUndefined();
    });

    it('retries once on version mismatch then throws ConflictException', async () => {
      findOne.mockResolvedValue(mockStock());
      qb.execute.mockResolvedValue({ affected: 0 });
      await expect(service.restoreStockOrThrow('BB-001', 'O+', 2)).rejects.toThrow(
        ConflictException,
      );
      expect(findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateStock', () => {
    it('throws NotFoundException when item does not exist', async () => {
      findOne.mockResolvedValue(null);
      await expect(service.updateStock('missing-id', 10)).rejects.toThrow(NotFoundException);
    });

    it('saves updated quantity', async () => {
      const stock = mockStock();
      findOne.mockResolvedValue(stock);
      const repo = service['inventoryRepo'] as any;
      await service.updateStock('stock-1', 20);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ availableUnits: 20 }));
    });
  });
});
