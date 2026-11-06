export type ShellUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type BankrollSummary = {
  id: string;
  name: string;
  currency: string;
  initialAmount: number;
  isActive: boolean;
  currentBankroll: number;
  profit: number;
  turnover: number;
  pendingStake: number;
  pendingCount: number;
  settledCount: number;
  winRate: number;
  roi: number;
  yield: number;
};
