import { z } from 'zod';
export const seats = ['N', 'E', 'S', 'W'] as const;
export type Seat = (typeof seats)[number];
export type Vulnerability = 'None' | 'NS' | 'EW' | 'All';
const shortText = z.string().trim().max(120);
const card = z.string().regex(/^[SHDC][AKQJT98765432]$/);
const hand = z.array(card).length(13);
export const boardSchema = z
  .object({
    id: z.string().min(1).max(120),
    number: z.number().int().min(1).max(9999),
    group: shortText.optional(),
    dealer: z.enum(seats),
    vulnerability: z.enum(['None', 'NS', 'EW', 'All']),
    deal: z.object({ N: hand, E: hand, S: hand, W: hand }),
  })
  .refine((b) => new Set(Object.values(b.deal).flat()).size === 52, '每副牌必須有 52 張不同的牌');
export type Board = z.infer<typeof boardSchema>;
export const resultSchema = z
  .object({
    id: z.string().min(1).max(120),
    boardId: z.string().min(1).max(120),
    table: shortText,
    assignmentId: z.string().max(120).default(''),
    board: z.number().int().min(1).max(9999),
    level: z.number().int().min(0).max(7),
    strain: z.enum(['C', 'D', 'H', 'S', 'NT']),
    doubled: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    declarer: z.enum(seats),
    tricks: z.number().int().min(0).max(13),
    lead: z.union([card, z.literal('')]).default(''),
    status: z.enum(['played', 'cancelled']).default('played'),
    nsScore: z.number().int().min(-20000).max(20000),
    playerNames: z
      .object({
        N: shortText.optional(),
        E: shortText.optional(),
        S: shortText.optional(),
        W: shortText.optional(),
      })
      .default({}),
    updatedAt: z.string().max(60).default(''),
    miniBridge: z.boolean().optional(),
  })
  .refine(
    (r) => r.status === 'cancelled' || r.level !== 0 || (r.tricks === 0 && r.doubled === 1),
    'Pass 必須是 0 墩、未加倍',
  );
export type Result = z.infer<typeof resultSchema>;
export type ResultInput = Pick<
  Result,
  'level' | 'strain' | 'doubled' | 'declarer' | 'tricks' | 'miniBridge'
>;
export const datasetSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(160),
    boards: z.array(boardSchema).max(256),
    results: z.array(resultSchema).max(10000),
    selectedBoardId: z.string().max(120).optional(),
    selectedResultId: z.string().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.boards.map((b) => b.id));
    if (
      ids.size !== data.boards.length ||
      new Set(data.results.map((r) => r.id)).size !== data.results.length
    )
      ctx.addIssue({ code: 'custom', message: '牌局或成績識別碼重複' });
    for (const r of data.results) {
      const board = data.boards.find((b) => b.id === r.boardId);
      if (!board || board.number !== r.board)
        ctx.addIssue({ code: 'custom', message: '成績對應的牌局不存在或牌號不符' });
    }
    if (data.selectedBoardId && !ids.has(data.selectedBoardId))
      ctx.addIssue({ code: 'custom', message: '選定的牌局不存在' });
    if (
      data.selectedResultId &&
      !data.results.some(
        (r) =>
          r.id === data.selectedResultId &&
          (!data.selectedBoardId || r.boardId === data.selectedBoardId),
      )
    )
      ctx.addIssue({ code: 'custom', message: '選定的成績不存在或不屬於目前牌局' });
  });
export type Dataset = z.infer<typeof datasetSchema>;
export function validateDataset(value: unknown): Dataset {
  const parsed = datasetSchema.safeParse(value);
  if (!parsed.success) throw new Error(`資料格式錯誤：${parsed.error.issues[0].message}`);
  return parsed.data;
}
