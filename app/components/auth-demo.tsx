"use client";

import { useState } from "react";
import { authClient, useSession, signIn, signUp, signOut } from "@/lib/auth-client";
import { UserRole } from "@/lib/auth";

export default function AuthDemo() {
  const { data: session, isPending } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signup");

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("patient");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await signUp.email({
        email,
        password,
        name,
        role,
      });

      if (res.error) {
        setError(res.error.message || "Sign up failed");
      } else {
        setSuccessMessage(`Account created successfully as ${role.replace("_", " ")}!`);
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await signIn.email({
        email,
        password,
      });

      if (res.error) {
        setError(res.error.message || "Invalid credentials");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (err: any) {
      setError(err?.message || "Google Sign In failed");
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex justify-center p-8 text-zinc-500 font-medium">
        Loading session status...
      </div>
    );
  }

  // If user is already authenticated
  if (session?.user) {
    const userRole = (session.user as { role?: string }).role || "patient";

    const roleBadges: Record<string, { label: string; style: string }> = {
      patient: { label: "Patient", style: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
      hospital_staff: { label: "Hospital Staff", style: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
      ambulance_driver: { label: "Ambulance Driver", style: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
      pharmacy: { label: "Pharmacy", style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    };

    const currentBadge = roleBadges[userRole] || roleBadges.patient;

    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800">
        <div className="text-center space-y-4">
          {session.user.image ? (
            <img
              src={session.user.image}
              alt={session.user.name || "User Avatar"}
              className="w-20 h-20 mx-auto rounded-full ring-4 ring-emerald-500/20"
            />
          ) : (
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {session.user.name?.[0]?.toUpperCase() || "U"}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              {session.user.name}
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{session.user.email}</p>
          </div>

          <div className="pt-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${currentBadge.style}`}>
              Role: {currentBadge.label}
            </span>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => signOut()}
              className="w-full py-2.5 px-4 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated - Render Login / Registration
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6">
        <button
          onClick={() => { setMode("signup"); setError(null); }}
          className={`flex-1 py-3 text-center font-semibold text-sm border-b-2 transition-colors ${
            mode === "signup"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Create Account
        </button>
        <button
          onClick={() => { setMode("signin"); setError(null); }}
          className={`flex-1 py-3 text-center font-semibold text-sm border-b-2 transition-colors ${
            mode === "signin"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Sign In
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
          {successMessage}
        </div>
      )}

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full mb-5 flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 font-medium text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.29C.47 8.21 0 10.05 0 12s.47 3.79 1.29 5.42l3.99-3.15z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
          />
        </svg>
        Continue with Google
      </button>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white dark:bg-zinc-900 px-2 text-zinc-400">
            Or with email
          </span>
        </div>
      </div>

      <form onSubmit={mode === "signup" ? handleEmailSignUp : handleEmailSignIn} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Alex Rivera"
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@carelink.org"
            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
          />
        </div>

        {mode === "signup" && (
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Select Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
            >
              <option value="patient">Patient</option>
              <option value="hospital_staff">Hospital Staff</option>
              <option value="ambulance_driver">Ambulance Driver</option>
              <option value="pharmacy">Pharmacy</option>
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-md disabled:opacity-50"
        >
          {loading ? "Processing..." : mode === "signup" ? "Register Account" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
