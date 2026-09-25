import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StatusDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Ongoing' })
  name!: string;
}

export class SimpleRelationDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Manga' })
  name!: string;

  @ApiProperty({ example: 'manga' })
  slug!: string;
}

export class ComicMetadataResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'One Piece' })
  title!: string;

  @ApiPropertyOptional({ example: 'Wan Pīsu', nullable: true })
  alternative_title!: string | null;

  @ApiPropertyOptional({
    example: 'Petualangan Monkey D. Luffy...',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: 101 })
  legacy_id!: BigInt;

  @ApiPropertyOptional({ example: '/covers/one-piece.webp', nullable: true })
  cover_path!: string | null;

  @ApiProperty({ example: 1110 })
  total_chapters!: number;

  @ApiProperty({ type: () => StatusDto })
  status!: StatusDto;

  @ApiProperty({ type: () => SimpleRelationDto })
  category!: SimpleRelationDto;

  @ApiProperty({ type: () => [SimpleRelationDto] })
  tags!: SimpleRelationDto[];

  @ApiProperty({ type: () => [SimpleRelationDto] })
  parodies!: SimpleRelationDto[];

  @ApiProperty({ type: () => [SimpleRelationDto] })
  characters!: SimpleRelationDto[];

  @ApiProperty({ type: () => [SimpleRelationDto] })
  artists!: SimpleRelationDto[];

  @ApiProperty({ type: () => [SimpleRelationDto] })
  authors!: SimpleRelationDto[];

  @ApiProperty({ type: () => [SimpleRelationDto] })
  groups!: SimpleRelationDto[];

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  created_at!: string;

  @ApiProperty({ example: '2026-09-25T00:00:00.000Z' })
  updated_at!: string;
}
