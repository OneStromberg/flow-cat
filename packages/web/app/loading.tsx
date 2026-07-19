// Minimal top-level Suspense fallback — covers routes with no more specific
// loading.tsx of their own (e.g. /login, /register) so navigation into them
// shows instant feedback instead of a frozen previous screen.
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50" aria-busy="true" aria-live="polite">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
        role="status"
      />
    </div>
  );
}
