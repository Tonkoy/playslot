import { describe, expect, it } from 'vitest';
import type { AppException } from '../common/app-exception';
import { assertInGoodStanding } from '../common/standing';
import { ClubsService } from './clubs.service';

/*
 * Who runs what: one admin per club (naming another replaces them), a platform
 * admin is never a club's admin and is not a player. Against a small in-memory
 * stand-in for the database; the trigger itself is in the migration.
 */

interface Member { id: number; clubId: number; userId: number; role: string; status: string }
interface Role { userId: number; role: string }

function world() {
  const users = [
    { id: 1, email: 'dani@club.bg', name: 'Dani' },
    { id: 2, email: 'ivo@club.bg', name: 'Ivo' },
    { id: 9, email: 'admin@playslot.bg', name: 'Platform' },
  ];
  const roles: Role[] = [
    { userId: 1, role: 'CLUB_ADMIN' },
    { userId: 2, role: 'PLAYER' },
    { userId: 9, role: 'PLATFORM_ADMIN' },
  ];
  const members: Member[] = [{ id: 1, clubId: 5, userId: 1, role: 'CLUB_ADMIN', status: 'ACTIVE' }];
  const audit: { action: string; before: unknown }[] = [];
  let seq = 10;
  const match = (m: Member, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) =>
      v && typeof v === 'object' && 'not' in (v as object) ? m[k as keyof Member] !== (v as { not: unknown }).not : m[k as keyof Member] === v,
    );
  const roleMatch = (r: Role, w: { userId: number; role?: string | { in: string[] } }) =>
    r.userId === w.userId && (w.role == null || (typeof w.role === 'string' ? r.role === w.role : w.role.in.includes(r.role)));

  const prisma = {
    club: { findUnique: async () => ({ id: 5, name: 'Club' }) },
    user: {
      findUnique: async ({ where, select }: { where: { email?: string; id?: number }; select?: { roles?: { where?: { role: string } } } }) => {
        const u = users.find((x) => x.email === where.email || x.id === where.id);
        if (!u) return null;
        const only = select?.roles?.where?.role;
        const mine = roles.filter((r) => r.userId === u.id && (!only || r.role === only));
        return { ...u, roles: mine, deletedAt: null, suspendedAt: null, locale: 'bg' };
      },
    },
    userRole: {
      create: async ({ data }: { data: Role }) => void roles.push(data),
      count: async ({ where }: { where: { userId: number } }) => roles.filter((r) => r.userId === where.userId).length,
      deleteMany: async ({ where }: { where: { userId: number; role: string } }) => {
        for (const r of roles.filter((x) => roleMatch(x, where))) roles.splice(roles.indexOf(r), 1);
      },
    },
    clubMember: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => members.filter((m) => match(m, where)),
      count: async ({ where }: { where: Record<string, unknown> }) => members.filter((m) => match(m, where)).length,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        for (const m of members.filter((x) => match(x, where))) members.splice(members.indexOf(m), 1);
      },
      upsert: async ({ create }: { create: Omit<Member, 'id'> }) => {
        // what the trigger guarantees
        if (members.some((m) => m.clubId === create.clubId && m.role === 'CLUB_ADMIN' && m.status === 'ACTIVE' && m.userId !== create.userId)) {
          throw new Error('Club already has an admin');
        }
        const found = members.find((m) => m.clubId === create.clubId && m.userId === create.userId && m.role === create.role);
        if (found) found.status = 'ACTIVE';
        else members.push({ ...create, id: ++seq });
      },
    },
    auditLog: { create: async ({ data }: { data: { action: string; before: unknown } }) => void audit.push(data) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  const svc = new ClubsService(prisma as never, {} as never, {} as never, {} as never);
  const admins = () => members.filter((m) => m.clubId === 5 && m.role === 'CLUB_ADMIN' && m.status === 'ACTIVE').map((m) => m.userId);
  const rolesOf = (id: number) => roles.filter((r) => r.userId === id).map((r) => r.role).sort();
  return { svc, prisma, admins, rolesOf, audit };
}

const reason = (e: unknown) => (e as AppException).details?.reason;

describe('the club admin', () => {
  it('is replaced, not joined, when the platform admin names someone else', async () => {
    const w = world();
    await w.svc.addClubAdmin(5, { email: 'ivo@club.bg' }, 9);
    expect(w.admins()).toEqual([2]);
    expect(w.rolesOf(2)).toEqual(['CLUB_ADMIN', 'PLAYER']);
    // Dani no longer runs a club: she keeps an account, as a player.
    expect(w.rolesOf(1)).toEqual(['PLAYER']);
    expect(w.audit.at(-1)).toMatchObject({ action: 'club.admin_replaced', before: { adminUserIds: [1] } });
  });

  it('stays as is when the same person is named again', async () => {
    const w = world();
    await w.svc.addClubAdmin(5, { email: 'dani@club.bg' }, 9);
    expect(w.admins()).toEqual([1]);
    expect(w.audit.at(-1)?.action).toBe('club.admin_added');
  });

  it('is never the platform admin', async () => {
    const w = world();
    await expect(w.svc.addClubAdmin(5, { email: 'ADMIN@playslot.bg' }, 9)).rejects.toSatisfy((e) => reason(e) === 'already_platform_admin');
    expect(w.admins()).toEqual([1]);
  });
});

describe('the platform admin', () => {
  it('cannot book or join as a player; others can', async () => {
    const w = world();
    await expect(assertInGoodStanding(w.prisma as never, 9)).rejects.toSatisfy((e) => reason(e) === 'not_a_player');
    await expect(assertInGoodStanding(w.prisma as never, 2)).resolves.toBeUndefined();
  });
});
