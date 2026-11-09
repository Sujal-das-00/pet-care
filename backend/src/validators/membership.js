import { z } from 'zod';

export const verifyBody = z.object({
  // Optional: the hash returned by Nimiq Pay. Without it the server searches for the payment by reference.
  txHash: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, 'Invalid transaction hash').optional(),
});
