import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getAdminSession } from "@/lib/session";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const { password } = await request.json();
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "admin_password_hash")
    .single();

  if (!data?.value) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 설정되지 않았습니다. /admin/setup 으로 이동하세요." },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(password, data.value);
  if (!valid) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const session = await getAdminSession();
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
