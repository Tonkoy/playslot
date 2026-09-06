import { Controller, Query, Sse, type MessageEvent } from '@nestjs/common';
import { filter, map, type Observable } from 'rxjs';
import { Public } from '../auth/decorators';
import { EventsService } from './events.service';

/** Server-Sent Events stream for live availability updates (spec §20). */
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @Sse('availability/stream')
  stream(@Query('clubId') clubId: string): Observable<MessageEvent> {
    const id = Number(clubId);
    return this.events.availabilityStream().pipe(
      filter((e) => e.clubId === id),
      map((e) => ({ data: { type: 'availability_changed', clubId: e.clubId } })),
    );
  }
}
