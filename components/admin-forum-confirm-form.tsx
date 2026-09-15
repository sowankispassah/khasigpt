"use client";

import type { ReactNode } from "react";

type AdminForumConfirmFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
};

export function AdminForumConfirmForm({
  action,
  children,
  className,
  confirmMessage,
}: AdminForumConfirmFormProps) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!confirmMessage) {
          return;
        }
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
