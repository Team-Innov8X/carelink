import { notFound } from 'next/navigation';
import OrganizationOnboardingForm from './onboarding-form';

export default async function OrganizationOnboardingPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== 'hospital' && role !== 'pharmacy') notFound();
  return <OrganizationOnboardingForm role={role} />;
}
