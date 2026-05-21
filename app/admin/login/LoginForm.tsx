"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password") as string;

    startTransition(async () => {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "로그인 실패");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          비밀번호
        </label>
        <input
          name="password"
          type="password"
          required
          className="input-field"
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
