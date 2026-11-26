import { courtShareCents } from '@playslot/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppException } from '../common/app-exception';
import type { GameEvent } from './game-copy';
import { GroupSessionsService } from './group-sessions.service';

/*
 * The rules of a player's game — who may open one, places, approval, who is
 * told what — against a small in-memory stand-in for the database. (The real
 * queries are covered by the e2e suite, which needs Postgres.)
 */

interface Reg { id: number; groupSessionId: number; userId: number; status: string; createdAt: Date }
type Row = Record<string, unknown> & { id: number };

function world() {
  const future = new Date(Date.now() + 2 * 86_400_000);
  const users: Row[] = [1, 2, 3, 4].map((id) => ({ id, name: `Player ${id}`, avatarUrl: null, playerProfile: { level: 'intermediate' }, locale: 'bg', roles: [] as { role: string }[] }));
  const reservations: Row[] = [
    { id: 10, userId: 1, clubId: 5, type: 'COURT', status: 'CONFIRMED', startsAt: future, endsAt: new Date(future.getTime() + 3_600_000), priceCents: 3000, currency: 'EUR' },
    { id: 11, userId: 1, clubId: 5, type: 'COURT', status: 'PENDING_APPROVAL', startsAt: future, endsAt: future, priceCents: 3000, currency: 'EUR' },
    { id: 12, userId: 1, clubId: 5, type: 'LESSON', status: 'CONFIRMED', startsAt: future, endsAt: future, priceCents: 3000, currency: 'EUR' },
  ];
  const sessions: Row[] = [];
  const regs: Reg[] = [];
  const told: { userId: number; event: GameEvent; taken?: number }[] = [];
  let seq = 100;

  const joined = (s: Row) => ({
    ...s,
    coach: null,
    organizer: users.find((u) => u.id === s.organizerUserId),
    club: { name: 'Club', timezone: 'Europe/Sofia' },
    reservation: { priceCents: reservations.find((r) => r.id === s.reservationId)?.priceCents ?? 0, resources: [{ resource: { name: 'Court 1', type: 'COURT' } }] },
    registrations: regs.filter((r) => r.groupSessionId === s.id).map((r) => ({ ...r, user: users.find((u) => u.id === r.userId) })),
    _count: { registrations: regs.filter((r) => r.groupSessionId === s.id && r.status === 'CONFIRMED').length },
  });
  const key = (w: { groupSessionId_userId: { groupSessionId: number; userId: number } }) => w.groupSessionId_userId;

  const prisma = {
    user: { findUnique: async ({ where }: { where: { id: number } }) => users.find((u) => u.id === where.id) ?? null },
    reservation: {
      findUnique: async ({ where }: { where: { id: number } }) => {
        const r = reservations.find((x) => x.id === where.id);
        return r ? { ...r, groupSession: sessions.find((s) => s.reservationId === r.id) ?? null } : null;
      },
    },
    groupSession: {
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: ++seq };
        sessions.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: number }; data: Row }) => Object.assign(sessions.find((s) => s.id === where.id)!, data),
      findUnique: async ({ where, include }: { where: { id: number }; include?: { registrations?: { where?: { status: string } } } }) => {
        const s = sessions.find((x) => x.id === where.id);
        if (!s) return null;
        const j = joined(s);
        const only = include?.registrations?.where?.status;
        return only ? { ...j, registrations: j.registrations.filter((r) => r.status === only) } : j;
      },
    },
    groupSessionRegistration: {
      count: async ({ where }: { where: { groupSessionId: number; status?: string } }) =>
        regs.filter((r) => r.groupSessionId === where.groupSessionId && (!where.status || r.status === where.status)).length,
      findUnique: async ({ where }: { where: Parameters<typeof key>[0] }) => {
        const k = key(where);
        const r = regs.find((x) => x.groupSessionId === k.groupSessionId && x.userId === k.userId);
        return r ? { ...r, session: sessions.find((s) => s.id === r.groupSessionId) } : null;
      },
      create: async ({ data }: { data: Omit<Reg, 'id' | 'createdAt'> }) => {
        regs.push({ ...data, id: ++seq, createdAt: new Date() });
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<Reg> }) => Object.assign(regs.find((r) => r.id === where.id)!, data),
      deleteMany: async ({ where }: { where: { groupSessionId: number; userId?: number } }) => {
        const gone = regs.filter((r) => r.groupSessionId === where.groupSessionId && (where.userId == null || r.userId === where.userId));
        gone.forEach((g) => regs.splice(regs.indexOf(g), 1));
        return { count: gone.length };
      },
    },
    $transaction: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)),
  };
  const notifier = {
    notifyUser: async (userId: number, event: GameEvent, info: { taken?: number }) => void told.push({ userId, event, taken: info.taken }),
    notifyPlayers: async (sessionId: number, event: GameEvent) =>
      void regs.filter((r) => r.groupSessionId === sessionId).forEach((r) => told.push({ userId: r.userId, event })),
  };
  const released: number[] = [];
  const reservationsSvc = { releaseReservation: async (id: number) => void released.push(id) };
  const svc = new GroupSessionsService(prisma as never, reservationsSvc as never, {} as never, notifier as never, { APP_BASE_URL: 'https://x' } as never);
  return { svc, regs, sessions, told, released, reservations };
}

const reason = (e: unknown) => (e as AppException).details?.reason ?? (e as AppException).code;
const settle = () => new Promise((r) => setTimeout(r, 0)); // notices are sent without waiting
const game = { reservationId: 10, title: 'Спаринг', kind: 'SPARRING', capacity: 2, joinMode: 'OPEN', costSplit: 'SHARED' } as const;

describe('a game organised by a player', () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => {
    w = world();
  });

  it('opens on the player\'s own confirmed court booking, with the court split among a full game', async () => {
    const dto = await w.svc.openGame(1, game);
    expect(dto).toMatchObject({ coachProfileId: null, organizerUserId: 1, organizerName: 'Player 1', kind: 'SPARRING', joinMode: 'OPEN', costSplit: 'SHARED', mine: true, spotsLeft: 2 });
    expect(dto.priceCents).toBe(1000); // 30.00 among the organiser + 2
    expect(courtShareCents(2500, 2)).toBe(834); // never rounds a cent away from the court
  });

  it('costs the others nothing when the organiser pays', async () => {
    expect((await w.svc.openGame(1, { ...game, costSplit: 'ORGANIZER' })).priceCents).toBe(0);
  });

  it('refuses someone else\'s booking, an unconfirmed one, a lesson, and a second game on the same booking', async () => {
    await expect(w.svc.openGame(2, game)).rejects.toSatisfy((e) => reason(e) === 'not_found');
    await expect(w.svc.openGame(1, { ...game, reservationId: 11 })).rejects.toSatisfy((e) => reason(e) === 'not_confirmed');
    await expect(w.svc.openGame(1, { ...game, reservationId: 12 })).rejects.toSatisfy((e) => reason(e) === 'not_a_court_booking');
    await w.svc.openGame(1, game);
    await expect(w.svc.openGame(1, game)).rejects.toSatisfy((e) => reason(e) === 'already_open');
  });

  it('gives a place at once in an open game, tells the organiser, and stops at capacity', async () => {
    const { id } = await w.svc.openGame(1, game);
    expect(await w.svc.register(id, 2)).toMatchObject({ status: 'CONFIRMED', spotsLeft: 1 });
    expect(await w.svc.register(id, 2)).toMatchObject({ status: 'CONFIRMED' }); // twice changes nothing
    await w.svc.register(id, 3);
    await expect(w.svc.register(id, 4)).rejects.toSatisfy((e) => reason(e) === 'full');
    await expect(w.svc.register(id, 1)).rejects.toSatisfy((e) => reason(e) === 'own_session');
    await settle();
    expect(w.told).toEqual([
      { userId: 1, event: 'joined', taken: 1 },
      { userId: 1, event: 'joined', taken: 2 },
    ]);
  });

  it('with approval: a request waits, holds no place, and the organiser lets people in up to capacity', async () => {
    const { id } = await w.svc.openGame(1, { ...game, capacity: 1, joinMode: 'APPROVAL' });
    expect(await w.svc.register(id, 2)).toMatchObject({ status: 'PENDING', spotsLeft: 1 });
    await w.svc.register(id, 3);
    await settle();
    expect(w.told.map((t) => t.event)).toEqual(['requested', 'requested']);

    const forOrganiser = await w.svc.getOne(id, 1);
    expect(forOrganiser).toMatchObject({ registeredCount: 0, pendingCount: 2 });
    expect(forOrganiser.participants?.map((p) => [p.name, p.status, p.level])).toEqual([
      ['Player 2', 'PENDING', 'intermediate'],
      ['Player 3', 'PENDING', 'intermediate'],
    ]);
    // Nobody else sees who asked; the one who asked sees their own state.
    const forPlayer = await w.svc.getOne(id, 2);
    expect(forPlayer.participants).toBeUndefined();
    expect(forPlayer).toMatchObject({ pending: true, registered: false, mine: false });

    await expect(w.svc.approve(id, 2, 3)).rejects.toSatisfy((e) => reason(e) === 'forbidden');
    expect(await w.svc.approve(id, 1, 2)).toMatchObject({ registeredCount: 1, spotsLeft: 0, pendingCount: 1 });
    await expect(w.svc.approve(id, 1, 3)).rejects.toSatisfy((e) => reason(e) === 'full');
    await w.svc.decline(id, 1, 3);
    await settle();
    expect(w.told.slice(2)).toEqual([
      { userId: 2, event: 'approved', taken: undefined },
      { userId: 3, event: 'declined', taken: undefined },
    ]);
  });

  it('tells the organiser when someone with a place leaves, not when a request is taken back', async () => {
    const { id } = await w.svc.openGame(1, game);
    await w.svc.register(id, 2);
    await w.svc.unregister(id, 2);
    await settle();
    expect(w.told.at(-1)).toEqual({ userId: 1, event: 'left', taken: 0 });

    const other = world();
    const g = await other.svc.openGame(1, { ...game, joinMode: 'APPROVAL' });
    await other.svc.register(g.id, 2);
    await other.svc.unregister(g.id, 2);
    await settle();
    expect(other.told.map((t) => t.event)).toEqual(['requested']);
  });

  it('called off by the organiser: everyone is told, the court booking stays, and it can be opened again clean', async () => {
    const { id } = await w.svc.openGame(1, game);
    await w.svc.register(id, 2);
    await expect(w.svc.cancel(id, 2)).rejects.toSatisfy((e) => reason(e) === 'forbidden');
    await w.svc.cancel(id, 1);
    await settle();
    expect(w.told.at(-1)).toEqual({ userId: 2, event: 'cancelled' });
    expect(w.released).toEqual([]); // a player's own booking is not given back
    await expect(w.svc.register(id, 3)).rejects.toSatisfy((e) => reason(e) === 'not_found');

    const again = await w.svc.openGame(1, { ...game, title: 'Пак' });
    expect(again).toMatchObject({ id, title: 'Пак', cancelled: false, registeredCount: 0 });
  });

  it('lets the organiser change the size and who pays, but not below those already in, and not the hour', async () => {
    const { id } = await w.svc.openGame(1, game);
    await w.svc.register(id, 2);
    await w.svc.register(id, 3);
    await expect(w.svc.update(id, 1, { capacity: 1 })).rejects.toSatisfy((e) => reason(e) === 'below_registered');
    await expect(w.svc.update(id, 1, { slot: { courtId: 1, startsAt: new Date().toISOString(), durationMin: 60 } })).rejects.toSatisfy(
      (e) => reason(e) === 'not_reschedulable',
    );
    expect((await w.svc.update(id, 1, { capacity: 5, priceCents: 9999 })).priceCents).toBe(500); // 30.00 among 6, not what was sent
    expect(await w.svc.update(id, 1, { costSplit: 'ORGANIZER', joinMode: 'APPROVAL' })).toMatchObject({ priceCents: 0, joinMode: 'APPROVAL' });
  });
});
