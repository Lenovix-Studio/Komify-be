import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  IsString,
  IsOptional,
  IsObject,
} from 'class-validator';

export class CreateLogDto {
  @IsString()
  level!: string;

  @IsString()
  source!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  stack_trace?: string;

  @IsOptional()
  @IsObject()
  context?: any;
}

@Injectable()
export class SystemLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateLogDto) {
    return this.prisma.system_logs.create({
      data: {
        level: data.level,
        source: data.source,
        message: data.message,
        stack_trace: data.stack_trace,
        context: data.context ? data.context : undefined,
      },
    });
  }

  async findAll() {
    return this.prisma.system_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: 500,
    });
  }

  async clearAll() {
    return this.prisma.system_logs.deleteMany();
  }
}
