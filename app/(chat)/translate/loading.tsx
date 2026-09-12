import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-6 lg:px-8">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-4 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Skeleton className="min-h-[280px] rounded-xl" />
            <Skeleton className="min-h-[280px] rounded-xl" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-2 h-4 w-72" />
          <Skeleton className="mt-5 min-h-[338px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
