import AuthDemo from "./components/auth-demo";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 font-sans p-6">
      <header className="mb-8 text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          CareLink Auth Portal
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          CareLink Authentication
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm max-w-md mx-auto">
          Role-Based Access Control for Patients, Hospital Staff, Ambulance Drivers, and Pharmacies via Email or Google OAuth.
        </p>
      </header>

      <main className="w-full max-w-md">
        <AuthDemo />
      </main>
    </div>
  );
}
