import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ComicMetadataDto {
  @ApiProperty({ example: 'One Piece', description: 'Judul utama komik' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'Wan Pīsu', description: 'Judul alternatif' })
  @IsOptional()
  @IsString()
  alternative_title?: string;

  @ApiPropertyOptional({
    example: 'Kisah petualangan bajak laut...',
    description: 'Sinopsis',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'Eiichiro Oda',
    description: 'Daftar author (string dipisah koma atau array)',
  })
  @IsOptional()
  authors?: string | string[];

  @ApiPropertyOptional({ example: 'Eiichiro Oda' })
  @IsOptional()
  artists?: string | string[];

  @ApiPropertyOptional({ example: 'Action, Adventure, Comedy' })
  @IsOptional()
  tags?: string | string[];

  @ApiPropertyOptional({ example: 'Monkey D. Luffy, Roronoa Zoro' })
  @IsOptional()
  characters?: string | string[];

  @ApiPropertyOptional({ example: 'Original' })
  @IsOptional()
  parodies?: string | string[];

  @ApiPropertyOptional({ example: 'Shueisha' })
  @IsOptional()
  groups?: string | string[];
}

export class ChapterItemDto {
  @ApiProperty({
    example: 'ch-1',
    description: 'ID referensi unik untuk matching file pages_{id}',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 1, description: 'Nomor chapter utama' })
  @IsNotEmpty()
  main!: number | string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Sub chapter (misal 5 untuk chapter 1.5)',
  })
  @IsOptional()
  sub?: number | string;

  @ApiPropertyOptional({
    example: 'Romance Dawn',
    description: 'Judul chapter',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'id', description: 'Kode bahasa (ISO, misal id/en)' })
  @IsString()
  @IsNotEmpty()
  language!: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID censorship',
  })
  @IsString()
  @IsNotEmpty()
  censorship_id!: string;
}

export class PublishComicDocumentDto {
  @ApiProperty({ type: () => ComicMetadataDto })
  @ValidateNested()
  @Type(() => ComicMetadataDto)
  metadata!: ComicMetadataDto;

  @ApiProperty({
    example: 'manga',
    description: 'Slug template kategori komik',
  })
  @IsString()
  @IsNotEmpty()
  template!: string;

  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'ID status (UUID atau ID status)',
  })
  @IsNotEmpty()
  status!: string;

  @ApiProperty({ type: [ChapterItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChapterItemDto)
  chapters!: ChapterItemDto[];
}
