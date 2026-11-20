export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold text-slate-300">404</h1>
      <p className="mt-2 text-slate-600">Page not found.</p>
      <p className="mt-1 text-sm text-slate-500">
        Please check that the URL is correct.
      </p>
    </div>
  );
}
