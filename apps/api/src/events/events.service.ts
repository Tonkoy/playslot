import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface AvailabilityChangedEvent {
  clubId: number;
}

/**
 * In-process pub/sub for live availability updates (spec §20: other viewers see
 * "just booked" in < ~2s). Single-instance for MVP; for horizontal scaling this
 * would be backed by Redis pub/sub so events fan out across API instances.
 */
@Injectable()
export class EventsService {
  private readonly availability$ = new Subject<AvailabilityChangedEvent>();

  emitAvailabilityChanged(clubId: number): void {
    this.availability$.next({ clubId });
  }

  availabilityStream() {
    return this.availability$.asObservable();
  }
}
