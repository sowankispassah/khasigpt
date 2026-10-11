type ContactIdentity = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type ContactPrefill = { name: string; email: string; phone: string };

export function getContactPrefill(user: ContactIdentity | null | undefined): ContactPrefill {
  return {
    name: [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(" ") || user?.name?.trim() || "",
    email: user?.email?.includes("@") ? user.email.trim() : "",
    phone: user?.phone?.trim() || "",
  };
}

export function applyContactPrefill<T extends ContactPrefill>(
  values: T,
  prefill: ContactPrefill,
  edited: ReadonlySet<keyof ContactPrefill>,
): T {
  let next = values;
  for (const field of ["name", "email", "phone"] as const) {
    if (!edited.has(field) && values[field] !== prefill[field]) {
      if (next === values) next = { ...values };
      next[field] = prefill[field];
    }
  }
  return next;
}
