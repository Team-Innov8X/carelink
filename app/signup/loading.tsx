import { DelayedSkeleton, SignupSkeleton } from '@/components/common/Skeletons';

export default function Loading() {
  return <DelayedSkeleton><SignupSkeleton /></DelayedSkeleton>;
}
