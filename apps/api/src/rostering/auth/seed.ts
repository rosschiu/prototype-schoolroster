import { hashPassword, type StandaloneAuthSeed } from './auth-service.js';

export async function createStandaloneRosterAuthSeed(): Promise<StandaloneAuthSeed> {
  const defaultPasswordHash = await hashPassword('Password123!');

  return {
    schools: [
      {
        id: 'school-steck-demo',
        name: 'Steck Demo School'
      },
      {
        id: 'school-other-demo',
        name: 'Other Demo School'
      }
    ],
    users: [
      {
        id: 'user-admin-demo',
        schoolId: 'school-steck-demo',
        email: 'admin@schoolroster.test',
        displayName: 'Admin Demo',
        status: 'active',
        passwordHash: defaultPasswordHash,
        roles: [{ role: 'school_admin', actorId: 'admin-demo' }]
      },
      {
        id: 'user-teacher-demo',
        schoolId: 'school-steck-demo',
        email: 'teacher@schoolroster.test',
        displayName: 'Teacher Demo',
        status: 'active',
        passwordHash: defaultPasswordHash,
        roles: [{ role: 'teacher', actorId: 'teacher-demo' }]
      },
      {
        id: 'user-teacher-sub-b',
        schoolId: 'school-steck-demo',
        email: 'sub-b@schoolroster.test',
        displayName: 'Substitute B',
        status: 'active',
        passwordHash: defaultPasswordHash,
        roles: [{ role: 'teacher', actorId: 'teacher-sub-b' }]
      },
      {
        id: 'user-multirole-demo',
        schoolId: 'school-steck-demo',
        email: 'multirole@schoolroster.test',
        displayName: 'Multi Role Demo',
        status: 'active',
        passwordHash: defaultPasswordHash,
        roles: [
          { role: 'teacher', actorId: 'teacher-multirole-demo' },
          { role: 'school_admin', actorId: 'admin-multirole-demo' }
        ]
      },
      {
        id: 'user-other-school-admin',
        schoolId: 'school-other-demo',
        email: 'other-admin@schoolroster.test',
        displayName: 'Other School Admin',
        status: 'active',
        passwordHash: defaultPasswordHash,
        roles: [{ role: 'school_admin', actorId: 'admin-other-demo' }]
      },
      {
        id: 'user-suspended-demo',
        schoolId: 'school-steck-demo',
        email: 'suspended@schoolroster.test',
        displayName: 'Suspended Demo',
        status: 'suspended',
        passwordHash: defaultPasswordHash,
        roles: [{ role: 'teacher', actorId: 'teacher-suspended-demo' }]
      }
    ]
  };
}
