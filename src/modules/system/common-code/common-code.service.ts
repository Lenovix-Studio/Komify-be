import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class CommonCodeService {
  private readonly logger = new Logger(CommonCodeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTypes() {
    return this.prisma.common_code_types.findMany({
      where: { deleted_at: null },
      orderBy: { name: 'asc' },
    });
  }

  async getTypeById(id: string) {
    const type = await this.prisma.common_code_types.findFirst({
      where: { id, deleted_at: null },
    });
    if (!type) {
      throw new NotFoundException('Common code type not found');
    }
    return type;
  }

  async createType(data: any) {
    try {
      return await this.prisma.common_code_types.create({
        data,
      });
    } catch (error: any) {
      if (error.code === 'P2002')
        throw new ConflictException('Type Code already exists');
      throw error;
    }
  }

  async updateType(id: string, data: any) {
    const type = await this.getTypeById(id);
    try {
      return await this.prisma.common_code_types.update({
        where: { id: type.id },
        data: { ...data, updated_at: new Date() },
      });
    } catch (error: any) {
      if (error.code === 'P2002')
        throw new ConflictException('Type Code already exists');
      throw error;
    }
  }

  async deleteType(id: string) {
    const type = await this.getTypeById(id);
    return this.prisma.common_code_types.delete({
      where: { id: type.id },
    });
  }

  async getDetails(typeId?: string) {
    return this.prisma.common_code_details.findMany({
      where: {
        deleted_at: null,
        ...(typeId ? { type_id: typeId } : {}),
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  async getDetailById(id: string) {
    const detail = await this.prisma.common_code_details.findFirst({
      where: { id, deleted_at: null },
    });
    if (!detail) {
      throw new NotFoundException('Common code detail not found');
    }
    return detail;
  }

  async createDetail(data: any) {
    try {
      return await this.prisma.common_code_details.create({
        data,
      });
    } catch (error: any) {
      if (error.code === 'P2002')
        throw new ConflictException('Detail Code already exists for this type');
      throw error;
    }
  }

  async updateDetail(id: string, data: any) {
    const detail = await this.getDetailById(id);
    try {
      return await this.prisma.common_code_details.update({
        where: { id: detail.id },
        data: { ...data, updated_at: new Date() },
      });
    } catch (error: any) {
      if (error.code === 'P2002')
        throw new ConflictException('Detail Code already exists for this type');
      throw error;
    }
  }

  async deleteDetail(id: string) {
    const detail = await this.getDetailById(id);
    return this.prisma.common_code_details.delete({
      where: { id: detail.id },
    });
  }
}
