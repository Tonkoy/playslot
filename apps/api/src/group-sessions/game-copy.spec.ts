import { describe, expect, it } from 'vitest';
import { gameNotice, type GameEvent } from './game-copy';

const info = { sessionId: 7, title: 'Спаринг двойки', clubName: '360 Тенис клуб', when: '28.11 18:00', playerName: 'Иван Петров', taken: 2, capacity: 3 };

describe('gameNotice', () => {
  it('tells the organiser who joined and how full the game is', () => {
    const n = gameNotice('joined', 'bg', info);
    expect(n.push.title).toBe('Иван Петров се записа за „Спаринг двойки“');
    expect(n.push.body).toBe('28.11 18:00 · 360 Тенис клуб · 2/3 места заети');
    expect(n.push.url).toBe('/bg/sessions#gs-7');
    expect(n.mail.subject).toBe(n.push.title);
  });

  it('asks the organiser to answer a request', () => {
    const n = gameNotice('requested', 'en', info);
    expect(n.push.title).toBe('Иван Петров asks to join “Спаринг двойки”');
    expect(n.push.body).toContain('Let them in or decline.');
    expect(n.push.url).toBe('/en/sessions#gs-7');
  });

  it('shows both times when a game moves', () => {
    const n = gameNotice('moved', 'bg', { ...info, previousWhen: '27.11 18:00' });
    expect(n.push.body).toBe('27.11 18:00 → 28.11 18:00 · 360 Тенис клуб · Мястото ти е запазено.');
  });

  it('has words for every event in both languages, and one notification per event and game', () => {
    const events: GameEvent[] = ['joined', 'requested', 'left', 'approved', 'declined', 'cancelled', 'moved'];
    const tags = new Set<string>();
    for (const e of events) {
      for (const locale of ['bg', 'en'] as const) {
        const n = gameNotice(e, locale, info);
        expect(n.push.title.length).toBeGreaterThan(5);
        expect(n.push.body.length).toBeGreaterThan(5);
        expect(n.mail.ctaLabel.length).toBeGreaterThan(3);
        tags.add(n.push.tag!);
      }
    }
    expect(tags.size).toBe(events.length);
  });

  it('copes without a player name or counts', () => {
    const n = gameNotice('left', 'bg', { sessionId: 1, title: 'Игра', clubName: 'Клуб', when: '01.12 10:00' });
    expect(n.push.title).toBe('Играч се отписа от „Игра“');
    expect(n.push.body).toBe('01.12 10:00 · Клуб');
  });
});
