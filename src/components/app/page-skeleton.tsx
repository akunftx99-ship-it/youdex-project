import { AppShell } from "@/components/app/app-shell";

/**
 * Route-level skeleton: shown the instant a navigation starts, so the tap
 * paints immediately instead of holding the previous page until the new chunk
 * and its data arrive.
 */
export function PageSkeleton({
  current,
  title,
  cards = 2,
  rows = 6,
}: {
  current: string;
  title: string;
  cards?: number;
  rows?: number;
}) {
  return (
    <AppShell current={current} title={title}>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {Array.from({ length: cards }).map((_, i) => (
            <section key={i} className="home-glass rounded-2xl p-6">
              <div className="h-2.5 w-28 animate-pulse rounded bg-white/[0.08]" />
              <div className="mt-4 h-9 w-40 animate-pulse rounded bg-white/[0.08]" />
              <div className="mt-3 h-2.5 w-52 animate-pulse rounded bg-white/[0.05]" />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
                <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
              </div>
            </section>
          ))}
        </div>

        <section className="home-glass rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="h-3 w-14 animate-pulse rounded bg-white/[0.08]" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.05]" />
            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.05]" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-white/[0.07]" />
                <div className="flex-1" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.05]" />
                <div className="h-2.5 w-14 animate-pulse rounded bg-white/[0.05]" />
                <div className="h-2.5 w-12 animate-pulse rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
