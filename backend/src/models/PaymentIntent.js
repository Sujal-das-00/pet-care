import mongoose from 'mongoose';

// A request to pay for membership. The `reference` is attached to the on-chain transaction as its
// message, which is how we tie a public blockchain payment back to a user.
const paymentIntentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // nulled on account deletion
    provider: { type: String, enum: ['nimiq'], default: 'nimiq' },
    network: { type: String, enum: ['mainnet', 'testnet'], required: true },
    recipient: { type: String, required: true }, // normalised Nimiq address we expect to be paid
    amountLuna: { type: Number, required: true, min: 1 },
    reference: { type: String, required: true, unique: true }, // e.g. PAW-7F3K9Q2M8XJ4 (<= 64 bytes)
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    txHash: { type: String, default: null },
    paidLuna: { type: Number, default: null },
    paidAt: { type: Date, default: null },
    // Used to reuse a still-fresh intent. A payment that arrives after this is still honoured.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// A blockchain transaction can fund exactly one intent (replay protection).
paymentIntentSchema.index({ txHash: 1 }, { unique: true, partialFilterExpression: { txHash: { $type: 'string' } } });
paymentIntentSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const PaymentIntent = mongoose.model('PaymentIntent', paymentIntentSchema);
