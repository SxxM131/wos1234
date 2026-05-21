export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold text-slate-300">404</h1>
      <p className="mt-2 text-slate-600">페이지를 찾을 수 없습니다.</p>
      <p className="mt-1 text-sm text-slate-500">
        URL이 올바른지 확인해 주세요.
      </p>
    </div>
  );
}
