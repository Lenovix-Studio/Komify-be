import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommonCodeService } from './common-code.service';

@ApiTags('Common Code')
@Controller('common-code')
export class CommonCodeController {
  constructor(private readonly commonCodeService: CommonCodeService) {}

  // --- Common Code Types ---
  @Get('types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all common code types' })
  async getTypes() {
    return this.commonCodeService.getTypes();
  }

  @Get('types/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get common code type by id' })
  async getTypeById(@Param('id') id: string) {
    return this.commonCodeService.getTypeById(id);
  }

  @Post('types')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create common code type' })
  async createType(@Body() data: any) {
    return this.commonCodeService.createType(data);
  }

  @Put('types/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update common code type' })
  async updateType(@Param('id') id: string, @Body() data: any) {
    return this.commonCodeService.updateType(id, data);
  }

  @Delete('types/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete common code type' })
  async deleteType(@Param('id') id: string) {
    return this.commonCodeService.deleteType(id);
  }

  // --- Common Code Details ---
  @Get('details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get common code details' })
  @ApiQuery({
    name: 'typeId',
    required: false,
    description: 'Filter by type ID',
  })
  async getDetails(@Query('typeId') typeId?: string) {
    return this.commonCodeService.getDetails(typeId);
  }

  @Get('details/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get common code detail by id' })
  async getDetailById(@Param('id') id: string) {
    return this.commonCodeService.getDetailById(id);
  }

  @Post('details')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create common code detail' })
  async createDetail(@Body() data: any) {
    return this.commonCodeService.createDetail(data);
  }

  @Put('details/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update common code detail' })
  async updateDetail(@Param('id') id: string, @Body() data: any) {
    return this.commonCodeService.updateDetail(id, data);
  }

  @Delete('details/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete common code detail' })
  async deleteDetail(@Param('id') id: string) {
    return this.commonCodeService.deleteDetail(id);
  }
}
