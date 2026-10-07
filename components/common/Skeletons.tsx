import React from 'react';

export function SignupSkeleton() {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-100 p-4" role="status" aria-live="polite" aria-label="Loading sign-up form">
      <div className="grid h-auto w-full max-w-4xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl md:grid-cols-2">
        {/* Left branding panel skeleton */}
        <aside className="relative flex flex-col justify-start overflow-hidden bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 p-8 text-white lg:p-10">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-white/20" />
            <div className="space-y-1.5">
              <div className="h-5 w-24 animate-pulse rounded bg-white/30" />
              <div className="h-3 w-36 animate-pulse rounded bg-white/20" />
            </div>
          </div>
          <div className="mt-14 space-y-3">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-white/25" />
            <div className="h-4 w-64 max-w-full animate-pulse rounded bg-white/15" />
            <div className="h-4 w-52 max-w-full animate-pulse rounded bg-white/15" />
          </div>
        </aside>

        {/* Right form fields skeleton */}
        <div className="p-6 md:p-8 space-y-4">
          <div className="space-y-2 mb-6">
            <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
          </div>

          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3.5 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
            </div>
          ))}

          <div className="h-12 w-full animate-pulse rounded-xl bg-sky-600/30 mt-4" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 mt-3" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-50" role="status" aria-live="polite" aria-label="Loading dashboard">
      {/* Top Navbar */}
      <div className="h-16 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-rose-500/30" />
            <div className="space-y-1">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="hidden max-w-md flex-1 px-8 md:block">
            <div className="h-9 w-full animate-pulse rounded-xl bg-slate-100" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl">
        {/* Left Sidebar Skeleton (hidden on small) */}
        <aside className="hidden w-64 border-r border-slate-200 bg-slate-900 p-4 md:block min-h-[calc(100vh-64px)] space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-700 mb-4 px-2" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-slate-800/80" />
          ))}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="h-7 w-60 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
          </div>

          {/* Action Card Skeleton ("Request a driver") */}
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-xl bg-rose-100" />
              <div className="space-y-2">
                <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-11 w-44 animate-pulse rounded-xl bg-rose-600/30" />
          </section>

          {/* Metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex justify-between items-center">
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                  <div className="h-8 w-8 animate-pulse rounded-xl bg-slate-100" />
                </div>
                <div className="h-8 w-16 animate-pulse rounded-lg bg-slate-200" />
              </div>
            ))}
          </div>

          {/* Emergency Request Cards Grid */}
          <div className="space-y-4">
            <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex justify-between">
                    <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-6 w-20 animate-pulse rounded-lg bg-slate-100" />
                    <div className="h-6 w-20 animate-pulse rounded-lg bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
