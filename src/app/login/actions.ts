"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createStaffSession, clearStaffSession } from "@/lib/auth/staff";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface StaffLoginState {
  error?: string;
}

export async function staffLogin(_prevState: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const staffUser = await prisma.staffUser.findUnique({ where: { email: parsed.data.email } });
  if (!staffUser || !staffUser.isActive) {
    return { error: "Invalid email or password." };
  }

  const passwordOk = await verifyPassword(parsed.data.password, staffUser.passwordHash);
  if (!passwordOk) {
    return { error: "Invalid email or password." };
  }

  await createStaffSession({
    staffUserId: staffUser.id,
    clinicId: staffUser.clinicId,
    role: staffUser.role,
    doctorId: staffUser.doctorId,
  });

  redirect("/app");
}

export async function staffLogout(): Promise<void> {
  await clearStaffSession();
  redirect("/login");
}
