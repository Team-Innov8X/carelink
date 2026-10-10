import { notFound } from 'next/navigation';
import SignupForm from '../../../components/auth/SignupForm';

const allowedRoles = ['patient', 'hospital_staff', 'driver', 'pharmacy'];

export default async function RoleSignupPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!allowedRoles.includes(role)) notFound();
  return <SignupForm role={role} />;
}
