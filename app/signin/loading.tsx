import { DelayedSkeleton, SigninSkeleton } from '@/components/common/Skeletons';

export default function Loading() {
  return <DelayedSkeleton><SigninSkeleton /></DelayedSkeleton>;
}
