import { redirect } from "next/navigation";
import { AuthCard, LoginForm } from "@/components/auth-forms";
import { getAuth } from "@/lib/authz";
import { env } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const auth = await getAuth();
  if (auth) redirect(auth.isSuperAdmin ? "/admin" : auth.memberships.some((m) => m.role !== "fighter") ? "/gym" : "/app");
  const { next } = await searchParams;
  const demo = env.isDev
    ? [
        { label: "Gym owner", email: "owner@demo.mma", password: "demo1234" },
        { label: "Coach", email: "coach@demo.mma", password: "demo1234" },
        { label: "Fighter", email: "fighter@demo.mma", password: "demo1234" },
      ]
    : undefined;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <AuthCard title="Welcome back" subtitle="Train. Fight. Improve." footer={<>Platform administration? <a href="/admin/login" className="underline">Admin sign in</a></>}>
        <LoginForm demo={demo} next={next} />
      </AuthCard>
    </main>
  );
}
