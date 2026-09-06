import { Injectable } from '@nestjs/common';
import { type SearchQuery, type SearchResponse, type SearchResultItem } from '@playslot/contracts';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_CLUBS = 30; // cap the fan-out for MVP
const SAMPLE = 3;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * Cross-club search (spec §15): for each candidate club, compute availability
   * via the shared engine and summarise free slots, from-price, and sample times.
   * MVP fan-out; a search index / distance ranking is a later refinement.
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const clubs = await this.prisma.club.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.cityId ? { cityId: query.cityId } : {}),
        resources: {
          some: {
            type: 'COURT',
            status: 'ACTIVE',
            ...(query.sport ? { sport: query.sport } : {}),
          },
        },
      },
      select: { id: true, slug: true, name: true, city: { select: { name: true } } },
      take: MAX_CLUBS,
      orderBy: { name: 'asc' },
    });

    const results: SearchResultItem[] = [];
    for (const club of clubs) {
      const avail = await this.availability.getAvailability({
        clubId: club.id,
        date: query.date,
        sport: query.sport,
        duration: query.duration,
      });

      const free = avail.slots.filter((s) => {
        if (s.state !== 'FREE') return false;
        if (query.startMin === undefined && query.endMin === undefined) return true;
        const min = hhmmToMin(s.start.slice(11, 16));
        if (query.startMin !== undefined && min < query.startMin) return false;
        if (query.endMin !== undefined && min > query.endMin) return false;
        return true;
      });

      const prices = free.map((s) => s.priceCents).filter((p): p is number => p != null);
      const sampleTimes = [...new Set(free.map((s) => s.start.slice(11, 16)))].sort().slice(0, SAMPLE);

      results.push({
        club: {
          id: club.id,
          slug: club.slug,
          name: club.name,
          cityName: club.city.name,
          surfaces: [...new Set(avail.courts.map((c) => c.surface).filter((x): x is string => !!x))],
        },
        freeCount: free.length,
        fromPriceCents: prices.length ? Math.min(...prices) : null,
        currency: avail.currency,
        sampleTimes,
      });
    }

    results.sort((a, b) => b.freeCount - a.freeCount);
    return { date: query.date, results };
  }
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
