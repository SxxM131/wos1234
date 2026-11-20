import { SetupForm } from "./SetupForm";

export default function AdminSetupPage() {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <h1 className="mb-2 text-center text-xl font-bold">Set admin password</h1>
      <p className="mb-6 text-center text-sm text-slate-500">
        One-time setup after first deploy.
      </p>
      <SetupForm />
    </div>
  );
}
