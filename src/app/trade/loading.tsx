import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return <PageSkeleton current="/trade" title="Spot Trading" cards={3} rows={5} />;
}
