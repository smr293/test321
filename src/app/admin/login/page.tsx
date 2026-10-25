import { AuthCard, LoginForm } from "@/components/auth-forms";
import { getAuth } from "@/lib/authz";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export const metadata = { title: "Admin sign in" };

export default async function AdminLoginPage() {
  const auth = await getAuth();
  if (auth?.isSuperAdmin) redirect("/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <AuthCard
        title="Platform admin"
        subtitle="Restricted access. All actions are logged."
        footer={<>Need help? Contact the platform owner.</>}
      >
        <LoginForm
          adminOnly
          demo={env.isDev ? [{ label: "Super admin", email: "admin", password: "admin" }] : undefined}
        />
      </AuthCard>
    </main>
  );
}
