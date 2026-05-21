import { createServiceClient } from "@/lib/supabase";
import { ReservationForm } from "./ReservationForm";

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reservation_open")
    .single();

  const reservationOpen = data?.value !== "false";

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-brand-900">Office Reservation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mon/Tue VP · Thu MO — higher speedup gets priority
        </p>
      </header>
      <ReservationForm reservationOpen={reservationOpen} token={token} />
    </div>
  );
}
