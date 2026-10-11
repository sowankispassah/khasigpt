import type { ReactNode } from "react";

/** Small muted section heading shared by the sidebar tools and history groups. */
export function SidebarSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 font-medium text-sidebar-foreground/55 text-xs">
      {children}
    </div>
  );
}
