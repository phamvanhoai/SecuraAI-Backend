export type LoginHistoryItem = {
  id: string;
  userId: string | null;
  userName: string | null;
  email: string;
  loginTime: string;
  status: 'success' | 'failed';
  ipAddress: string | null;
  userAgent: string | null;
  failureReason: string | null;
};
export type LoginHistoryList = {
  items: LoginHistoryItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
