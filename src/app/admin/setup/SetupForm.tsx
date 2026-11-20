"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setupAdminPassword } from "../actions";

export function SetupForm() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await setupAdminPassword(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        router.push("/admin");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          Password
        </label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          className="input-field"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          Confirm password
        </label>
        <input
          name="confirm"
          type="password"
          required
          minLength={6}
          className="input-field"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
