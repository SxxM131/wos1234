import { SetupForm } from "./SetupForm";

export default function AdminSetupPage() {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <h1 className="mb-2 text-center text-xl font-bold">관리자 비밀번호 설정</h1>
      <p className="mb-6 text-center text-sm text-slate-500">
        최초 배포 후 한 번만 설정합니다.
      </p>
      <SetupForm />
    </div>
  );
}
