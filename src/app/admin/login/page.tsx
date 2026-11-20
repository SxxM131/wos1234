import { LoginForm } from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <h1 className="mb-6 text-center text-xl font-bold">r4+ only</h1>
      <LoginForm />
      <a
        href="/admin/setup"
        className="mt-4 text-center text-sm text-slate-500 underline"
      >
        Initial password setup
      </a>
    </div>
  );
}
