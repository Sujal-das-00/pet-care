import { z } from 'zod';

export const sendMessageBody = z.object({ text: z.string().trim().min(1, 'Write something first').max(500) });
export const messagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().max(200).optional(),
});
export const roomParams = z.object({ room: z.string().min(3).max(60) });
