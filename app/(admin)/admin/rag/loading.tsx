import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-4 flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-32" />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
        <Skeleton className="mt-4 h-9 w-36" />
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-44" />
        <div className="mt-4 grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    </div>
  );
}

