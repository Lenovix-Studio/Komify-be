import { ApiProperty } from '@nestjs/swagger';

export class StatusResponseDto {
  @ApiProperty({
    description: 'Unique identifier status',
    example: 'd3b07384-d113-4956-a5e1-7c57796113cc',
  })
  id!: string;

  @ApiProperty({
    description: 'Nama status komik/sistem',
    example: 'Ongoing',
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
