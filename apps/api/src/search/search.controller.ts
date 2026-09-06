import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema } from '@playslot/contracts';
import { Public } from '../auth/decorators';
import { SearchService } from './search.service';

/** Public cross-club search (spec §15). */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get()
  run(@Query() query: unknown) {
    return this.search.search(searchQuerySchema.parse(query));
  }
}
