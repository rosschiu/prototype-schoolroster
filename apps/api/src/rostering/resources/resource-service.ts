import { randomUUID } from 'node:crypto';
import type { PostgresDatabase } from '../../db/postgres.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import { tableRef } from '../db/schema.js';

export type Room = {
  id: string;
  schoolId: string;
  name: string;
  roomCode?: string;
  capacity?: number;
  status: 'active' | 'inactive';
};

export type EquipmentResource = {
  id: string;
  schoolId: string;
  name: string;
  resourceType: string;
  quantity: number;
  status: 'active' | 'inactive';
};

export type ResourceRepository = {
  saveRoom(room: Room): Promise<Room>;
  saveEquipmentResource(resource: EquipmentResource): Promise<EquipmentResource>;
  listRooms(schoolId: string): Promise<Room[]>;
  listEquipmentResources(schoolId: string): Promise<EquipmentResource[]>;
};

export class ResourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceValidationError';
  }
}

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin' || session.activeSchoolId !== schoolId) {
    throw new ResourceValidationError('Only school admins can manage local roster resources for their own school.');
  }
}

export class InMemoryResourceRepository implements ResourceRepository {
  readonly rooms = new Map<string, Room>();
  readonly equipmentResources = new Map<string, EquipmentResource>();

  async saveRoom(room: Room): Promise<Room> {
    const duplicate = [...this.rooms.values()].find(
      (item) => item.schoolId === room.schoolId && item.name === room.name && item.id !== room.id
    );
    if (duplicate) {
      throw new ResourceValidationError('A room with this name already exists for this school.');
    }
    this.rooms.set(room.id, room);
    return room;
  }

  async saveEquipmentResource(resource: EquipmentResource): Promise<EquipmentResource> {
    const duplicate = [...this.equipmentResources.values()].find(
      (item) => item.schoolId === resource.schoolId && item.name === resource.name && item.id !== resource.id
    );
    if (duplicate) {
      throw new ResourceValidationError('An equipment/resource record with this name already exists for this school.');
    }
    this.equipmentResources.set(resource.id, resource);
    return resource;
  }

  async listRooms(schoolId: string): Promise<Room[]> {
    return [...this.rooms.values()].filter((item) => item.schoolId === schoolId);
  }

  async listEquipmentResources(schoolId: string): Promise<EquipmentResource[]> {
    return [...this.equipmentResources.values()].filter((item) => item.schoolId === schoolId);
  }
}

type RoomRow = {
  id: string;
  school_id: string;
  name: string;
  room_code: string | null;
  capacity: number | null;
  status: Room['status'];
};

type EquipmentResourceRow = {
  id: string;
  school_id: string;
  name: string;
  resource_type: string;
  quantity: number;
  status: EquipmentResource['status'];
};

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    schoolId: row.school_id,
    name: row.name,
    roomCode: row.room_code ?? undefined,
    capacity: row.capacity ?? undefined,
    status: row.status
  };
}

function toEquipmentResource(row: EquipmentResourceRow): EquipmentResource {
  return {
    id: row.id,
    schoolId: row.school_id,
    name: row.name,
    resourceType: row.resource_type,
    quantity: row.quantity,
    status: row.status
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

export class PostgresResourceRepository implements ResourceRepository {
  constructor(private readonly database: PostgresDatabase, private readonly schema: string) {}

  async saveRoom(room: Room): Promise<Room> {
    try {
      await this.database.query(
        `insert into ${tableRef(this.schema, 'rostering_rooms')} (
        id, school_id, name, room_code, capacity, status
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (id) do update set
        name = excluded.name,
        room_code = excluded.room_code,
        capacity = excluded.capacity,
        status = excluded.status,
        updated_at = now()`,
        [room.id, room.schoolId, room.name, room.roomCode ?? null, room.capacity ?? null, room.status]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ResourceValidationError('A room with this name already exists for this school.');
      }
      throw error;
    }
    return room;
  }

  async saveEquipmentResource(resource: EquipmentResource): Promise<EquipmentResource> {
    try {
      await this.database.query(
        `insert into ${tableRef(this.schema, 'rostering_equipment_resources')} (
        id, school_id, name, resource_type, quantity, status
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (id) do update set
        name = excluded.name,
        resource_type = excluded.resource_type,
        quantity = excluded.quantity,
        status = excluded.status,
        updated_at = now()`,
        [resource.id, resource.schoolId, resource.name, resource.resourceType, resource.quantity, resource.status]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ResourceValidationError('An equipment/resource record with this name already exists for this school.');
      }
      throw error;
    }
    return resource;
  }

  async listRooms(schoolId: string): Promise<Room[]> {
    const result = await this.database.query<RoomRow>(
      `select id, school_id, name, room_code, capacity, status
       from ${tableRef(this.schema, 'rostering_rooms')}
       where school_id = $1
       order by name`,
      [schoolId]
    );
    return result.rows.map(toRoom);
  }

  async listEquipmentResources(schoolId: string): Promise<EquipmentResource[]> {
    const result = await this.database.query<EquipmentResourceRow>(
      `select id, school_id, name, resource_type, quantity, status
       from ${tableRef(this.schema, 'rostering_equipment_resources')}
       where school_id = $1
       order by name`,
      [schoolId]
    );
    return result.rows.map(toEquipmentResource);
  }
}

export function createResourceService(repository: ResourceRepository) {
  return {
    async createRoom(input: {
      session: AuthenticatedRosterSession;
      schoolId: string;
      name: string;
      roomCode?: string;
      capacity?: number;
    }): Promise<Room> {
      assertAdmin(input.session, input.schoolId);
      return repository.saveRoom({
        id: randomUUID(),
        schoolId: input.schoolId,
        name: input.name,
        roomCode: input.roomCode,
        capacity: input.capacity,
        status: 'active'
      });
    },

    async createEquipmentResource(input: {
      session: AuthenticatedRosterSession;
      schoolId: string;
      name: string;
      resourceType?: string;
      quantity?: number;
    }): Promise<EquipmentResource> {
      assertAdmin(input.session, input.schoolId);
      return repository.saveEquipmentResource({
        id: randomUUID(),
        schoolId: input.schoolId,
        name: input.name,
        resourceType: input.resourceType ?? 'equipment',
        quantity: input.quantity ?? 1,
        status: 'active'
      });
    },

    async listResources(input: { session: AuthenticatedRosterSession; schoolId: string }) {
      if (input.session.activeSchoolId !== input.schoolId) {
        throw new ResourceValidationError('Cross-school resource access is not allowed.');
      }
      return {
        rooms: await repository.listRooms(input.schoolId),
        equipmentResources: await repository.listEquipmentResources(input.schoolId)
      };
    }
  };
}

export type ResourceService = ReturnType<typeof createResourceService>;
