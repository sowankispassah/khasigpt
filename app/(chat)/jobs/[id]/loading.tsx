import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-5 px-3 py-4 md:px-4 md:py-6">
      <div className="h-9 w-32 rounded-md bg-muted" />

      <Card>
        <CardHeader className="space-y-3">
          <div className="h-8 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-4 rounded bg-muted" />
            <div className="h-4 rounded bg-muted" />
            <div className="h-4 rounded bg-muted" />
            <div className="h-4 rounded bg-muted" />
            <div className="h-4 rounded bg-muted" />
            <div className="h-4 rounded bg-muted" />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-40 rounded-md bg-muted" />
            <div className="h-9 w-40 rounded-md bg-muted" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-5/6 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}
