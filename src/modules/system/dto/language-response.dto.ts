import { ApiProperty } from '@nestjs/swagger';

export class LanguageResponseDto {
  @ApiProperty({
    description: 'Kode bahasa (ISO code)',
    example: 'id',
    maxLength: 5,
  })
  code!: string;

  @ApiProperty({
    description: 'Nama bahasa',
    example: 'Indonesian',
  })
  name!: string;

  @ApiProperty({
    description: 'Timestamp waktu dibuat',
    example: '2026-01-01T00:00:00.000Z',
  })
  created_at!: Date;

  @ApiProperty({
    description: 'Timestamp terakhir diperbarui',
    example: '2026-01-01T00:00:00.000Z',
  })
  updated_at!: Date;
}
