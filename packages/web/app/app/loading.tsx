// Suspense fallback for every screen under /app (worker shell). Worker
// screens are async server components doing Firestore/Sheets reads, so
// without this, navigation freezes the previous screen until the round-trip
// finishes. This renders instantly on tab switch, matching the worker page
// container (`mx-auto max-w-md p-5`) and the app's gray-block skeleton style.
export default function AppLoading() {
  return (
    <main className="mx-auto max-w-md p-5" aria-busy="true" aria-live="polite">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-1/2 rounded bg-gray-200" />
        <div className="space-y-2">
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
        </div>
      </div>
    </main>
  );
}
