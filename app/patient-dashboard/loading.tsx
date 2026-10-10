import { DashboardSkeleton, DelayedSkeleton } from '@/components/common/Skeletons';

export default function Loading() {
  return <DelayedSkeleton><DashboardSkeleton /></DelayedSkeleton>;
}
