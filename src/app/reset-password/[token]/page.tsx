import Link from "next/link";
import { AuthCard, ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Set a new password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <AuthCard title="Set a new password" subtitle="Choose something you haven't used before.">
        <ResetPasswordForm token={token} />
        <p className="mt-4 text-center text-xs">
          <Link href="/login" style={{ color: "var(--muted)" }}>
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    </main>
  );
}
