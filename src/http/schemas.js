import { z } from 'zod';
import { config } from '../config.js';
import { CONDITIONS } from '../core/status.js';
import { DISPUTE_REASONS } from '../db/models/Dispute.js';
import { REPORT_REASONS } from '../db/models/Report.js';

const cents = z.number().int().min(1).max(config.maxBidCents);

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(10).max(200),
  displayName: z.string().min(2).max(40),
  // Refused rather than defaulted. A bid is described as binding, and
  // an agreement nobody actively made is not one you can hold anyone to.
  acceptTerms: z.literal(true, {
    message: 'You have to accept the terms to open an account.',
  }),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export const requestResetSchema = z.object({
  email: z.email(),
});

export const confirmTokenSchema = z.object({
  token: z.string().min(16).max(400),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(400),
  password: z.string().min(10).max(200),
});

export const notifyPrefsSchema = z.object({
  outbid: z.boolean().optional(),
  won: z.boolean().optional(),
  closingSoon: z.boolean().optional(),
});

export const reportItemSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(2000).default(''),
});

export const resolveReportSchema = z.object({
  outcome: z.enum(['uphold', 'dismiss']),
  note: z.string().max(2000).default(''),
  // Upholding a report usually means the lot should come down too.
  withdrawItem: z.boolean().default(false),
});

export const openDisputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  detail: z.string().max(4000).default(''),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(['buyer', 'seller']),
  resolution: z.string().min(1).max(4000),
});

export const sellerDecisionSchema = z.object({
  note: z.string().max(500).optional(),
});

export const withdrawItemSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const createItemSchema = z
  .object({
    title: z.string().min(3).max(140),
    description: z.string().max(4000).default(''),
    condition: z.enum(CONDITIONS),
    startingPriceCents: cents,
    reservePriceCents: z.number().int().min(0).max(config.maxBidCents).default(0),
    bidIncrementCents: cents.nullable().default(null),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    shippingDetails: z
      .object({
        weightKg: z.number().positive().max(1000).optional(),
        shipsFrom: z.string().max(120).optional(),
      })
      .optional(),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  })
  .refine((d) => d.endTime.getTime() - d.startTime.getTime() >= 60_000, {
    message: 'an auction must run for at least a minute',
    path: ['endTime'],
  })
  .refine((d) => d.reservePriceCents === 0 || d.reservePriceCents >= d.startingPriceCents, {
    message: 'a reserve below the starting price is not a reserve',
    path: ['reservePriceCents'],
  });

export const placeBidSchema = z.object({
  amountCents: cents,
});

export const browseSchema = z.object({
  status: z.string().optional(),
  q: z.string().max(140).optional(),
  condition: z.enum(CONDITIONS).optional(),
  sellerId: z.string().optional(),
  sort: z.enum(['ending', 'newest', 'price']).default('ending'),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const checkoutSchema = z.object({
  shipping: z.object({
    fullName: z.string().min(2).max(120),
    line1: z.string().min(2).max(160),
    line2: z.string().max(160).optional().default(''),
    city: z.string().min(1).max(80),
    region: z.string().max(80).optional().default(''),
    postcode: z.string().min(2).max(24),
    country: z.string().min(2).max(60),
  }),
});
