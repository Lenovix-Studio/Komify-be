import { Controller, Get, Post, Body, Delete } from '@nestjs/common';
import { SystemLogsService, CreateLogDto } from './system-logs.service';

@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Post()
  create(@Body() createLogDto: CreateLogDto) {
    return this.systemLogsService.create(createLogDto);
  }

  @Get()
  findAll() {
    return this.systemLogsService.findAll();
  }

  @Delete()
  clearAll() {
    return this.systemLogsService.clearAll();
  }
}
