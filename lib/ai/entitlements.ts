import type { UserRole } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerDay: number | null;
};

export const entitlementsByUserRole: Record<UserRole, Entitlements> = {
  regular: {
    maxMessagesPerDay: 100,
  },
  admin: {
    maxMessagesPerDay: null,
  },
};
