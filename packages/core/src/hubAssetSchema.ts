import z from "zod";

export const HUB_ASSET_CATEGORIES = ["package", "bundle", "blueprint"] as const;
export type HubAssetCategory = (typeof HUB_ASSET_CATEGORIES)[number];

export const HubAssetStatus = z.enum(["draft", "trial", "enforced", "deprecated", "archived"]);
export type HubAssetStatus = z.infer<typeof HubAssetStatus>;

export const HubEvidence = z.object({
  type: z.string(),
  ref: z.string()
});
export type HubEvidence = z.infer<typeof HubEvidence>;

export const HubAssetMeta = z.object({
  id: z.string(),
  version: z.string(),
  category: z.enum(HUB_ASSET_CATEGORIES),
  kind: z.string().optional(),
  owner: z.string().optional(),
  status: HubAssetStatus.default("trial"),
  stages: z.array(z.enum(["req", "arch", "dev", "test"])).default([]),
  tags: z.array(z.string()).default([]),
  compat: z
    .object({
      min_core: z.string().optional(),
      max_core: z.string().optional()
    })
    .optional(),
  provenance: z
    .object({
      source: z.string().optional(),
      evidence: z.array(HubEvidence).default([])
    })
    .default({ evidence: [] }),
  security: z
    .object({
      hash: z.string().optional(),
      signature: z.string().optional()
    })
    .optional(),
  updatedAt: z.string().optional()
});
export type HubAssetMeta = z.infer<typeof HubAssetMeta>;

export const HubReviewStatus = z.enum(["pending", "approved", "rejected"]);
export type HubReviewStatus = z.infer<typeof HubReviewStatus>;

export const HubReviewRecord = z.object({
  status: HubReviewStatus.default("pending"),
  requestedBy: z.string().optional(),
  requestedAt: z.string().optional(),
  approvedBy: z.array(z.string()).default([]),
  rejectedBy: z.string().optional(),
  rejectedReason: z.string().optional(),
  updatedAt: z.string().optional()
});
export type HubReviewRecord = z.infer<typeof HubReviewRecord>;
