import { AuthCard, ForgotPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <AuthCard title="Reset your password" subtitle="Enter the email you use for MMA OS.">
        <ForgotPasswordForm />
      </AuthCard>
    </main>
  );
}
