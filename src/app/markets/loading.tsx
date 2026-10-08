import { PageSkeleton } from "@/components/app/page-skeleton";

export default function Loading() {
  return <PageSkeleton current="/markets" title="Markets" cards={3} rows={8} />;
}
