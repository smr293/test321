import { redirect } from "next/navigation";
import { AuthCard, RegisterForm } from "@/components/auth-forms";
import { getAuth } from "@/lib/authz";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const auth = await getAuth();
  if (auth) redirect("/app");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <AuthCard title="Create your account" subtitle="Start training smarter in under a minute.">
        <RegisterForm />
      </AuthCard>
    </main>
  );
}
