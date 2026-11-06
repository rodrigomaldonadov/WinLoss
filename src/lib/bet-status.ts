import type { BetStatus } from "@prisma/client";

import { BET_STATUS_LABELS, BET_STATUS_TONES } from "@/lib/constants";

type StatusTone = (typeof BET_STATUS_TONES)[BetStatus];

const TONE_CLASSES: Record<StatusTone, string> = {
  pending:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
  win: "border-transparent bg-success/10 text-success",
  loss: "border-transparent bg-loss/10 text-loss",
  neutral: "border-transparent bg-muted text-muted-foreground",
};

const TONE_TEXT_CLASSES: Record<StatusTone, string> = {
  pending: "text-amber-700 dark:text-amber-400",
  win: "text-success",
  loss: "text-loss",
  neutral: "text-muted-foreground",
};

export function getBetStatusMeta(status: BetStatus) {
  const tone = BET_STATUS_TONES[status];

  return {
    label: BET_STATUS_LABELS[status],
    tone,
    badgeClassName: TONE_CLASSES[tone],
    textClassName: TONE_TEXT_CLASSES[tone],
  };
}
