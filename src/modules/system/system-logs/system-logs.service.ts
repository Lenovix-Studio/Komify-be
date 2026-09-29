import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export class CreateLogDto {
  level!: string;
  source!: string;
  message!: string;
  stack_trace?: string;
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
