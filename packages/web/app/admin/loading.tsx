// Suspense fallback for every screen under /admin. Same rationale as
// app/app/loading.tsx: admin screens are async server components (Firestore/
// Sheets reads), so this gives instant feedback on nav instead of a frozen
// previous screen. Matches the admin page container (`mx-auto max-w-4xl p-5`).
export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-4xl p-5" aria-busy="true" aria-live="polite">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="h-9 w-28 rounded-lg bg-gray-200" />
        </div>
        <div className="space-y-2">
          <div className="h-12 rounded-lg bg-gray-200" />
          <div className="h-12 rounded-lg bg-gray-200" />
          <div className="h-12 rounded-lg bg-gray-200" />
          <div className="h-12 rounded-lg bg-gray-200" />
        </div>
      </div>
    </main>
  );
}
