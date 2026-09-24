import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsArray,
  IsEnum,
} from 'class-validator';
import { transformToArray } from '@/helper/comics';

export enum ComicSortBy {
  LATEST = 'latest',
  NEWEST = 'newest',
  POPULAR = 'popular',
  TITLE = 'title',
}

export class FindComicsQueryDto {
  @ApiPropertyOptional({ description: 'Nomor halaman', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Jumlah data per halaman',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Pencarian judul / alternatif judul' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter berdasarkan slug kategori' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan nama status (misal: Ongoing, Completed)',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter kode bahasa chapter (misal: id, en)',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Filter slug tags (comma-separated, misal: action,comedy)',
    type: String,
  })
  @IsOptional()
  @Transform(transformToArray)
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Filter slug parodies (comma-separated)',
    type: String,
  })
  @IsOptional()
  @Transform(transformToArray)
  @IsArray()
  @IsString({ each: true })
  parodies?: string[];

  @ApiPropertyOptional({
    description: 'Filter slug characters (comma-separated)',
    type: String,
  })
  @IsOptional()
  @Transform(transformToArray)
  @IsArray()
  @IsString({ each: true })
  characters?: string[];

  @ApiPropertyOptional({
    description: 'Filter slug artists (comma-separated)',
    type: String,
  })
  @IsOptional()
  @Transform(transformToArray)
  @IsArray()
  @IsString({ each: true })
  artists?: string[];

  @ApiPropertyOptional({
    description: 'Filter slug groups (comma-separated)',
    type: String,
  })
  @IsOptional()
  @Transform(transformToArray)
  @IsArray()
  @IsString({ each: true })
  groups?: string[];

  @ApiPropertyOptional({
    description: 'Filter slug authors (comma-separated)',
    type: String,
  })
  @IsOptional()
  @Transform(transformToArray)
  @IsArray()
  @IsString({ each: true })
  authors?: string[];

  @ApiPropertyOptional({
    enum: ComicSortBy,
    default: ComicSortBy.LATEST,
    description: 'Urutan pengurutan data',
  })
  @IsOptional()
  @IsEnum(ComicSortBy)
  sort?: ComicSortBy = ComicSortBy.LATEST;
}
