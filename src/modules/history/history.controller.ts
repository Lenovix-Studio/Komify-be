import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('History')
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record or update reading history' })
  async recordHistory(
    @Body()
    body: {
      comic_id: string;
      chapter_id: string;
      last_page?: number;
    },
  ) {
    if (!body?.comic_id || !body?.chapter_id) {
      throw new BadRequestException('comic_id and chapter_id are required');
    }
    return this.historyService.recordHistory(body);
  }

  @Get()
  @ApiOperation({ summary: 'Get reading histories' })
  async getHistories() {
    return this.historyService.getHistories();
  }

  @Delete(':comicId')
  @ApiOperation({ summary: 'Delete reading history for a comic' })
  async deleteHistory(@Param('comicId') comicId: string) {
    return this.historyService.deleteHistory(comicId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all reading histories' })
  async clearHistories() {
    return this.historyService.clearHistories();
  }
}
