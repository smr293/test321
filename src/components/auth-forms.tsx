"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { loginAction, registerAction, requestPasswordResetAction, resetPasswordAction, type AuthFormState } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--danger)" }} />
      <span>{message}</span>
    </div>
  );
}

export function LoginForm({
  adminOnly = false,
  demo,
  next,
}: {
  adminOnly?: boolean;
  demo?: { email: string; password: string; label: string }[];
  next?: string;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(loginAction, null);
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState(adminOnly ? "admin" : "");
  const [password, setPassword] = useState(adminOnly ? "admin" : "");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="adminOnly" value={adminOnly ? "true" : "false"} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <ErrorBox message={state?.error} />
      <Field label={adminOnly ? "Admin username or email" : "Email"} htmlFor="email">
        <Input
          id="email"
          name="email"
          type="text"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={adminOnly ? "admin" : "you@gym.com"}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center"
            aria-label={show ? "Hide password" : "Show password"}
            style={{ color: "var(--muted)" }}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <Field label="Authenticator code (if enabled)" htmlFor="code" hint="6 digits from your authenticator app. Leave empty if 2FA is off.">
        <Input id="code" name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="000000" autoComplete="one-time-code" />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        <ShieldCheck className="h-4 w-4" />
        {adminOnly ? "Sign in to platform admin" : "Sign in"}
      </SubmitButton>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="underline-offset-4 hover:underline" style={{ color: "var(--muted)" }}>
          Forgot password?
        </Link>
        {!adminOnly ? (
          <Link href="/register" className="font-medium" style={{ color: "var(--accent)" }}>
            Create account
          </Link>
        ) : (
          <Link href="/login" style={{ color: "var(--muted)" }}>
            Member sign in
          </Link>
        )}
      </div>
      {demo?.length ? (
        <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--line)", background: "var(--card-2)" }}>
          <p className="mb-2 font-semibold">Demo accounts (development only)</p>
          <div className="grid gap-1.5">
            {demo.map((d) => (
              <button
                key={d.email}
                type="button"
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-[var(--card)]"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                <span style={{ color: "var(--muted)" }}>{d.label}</span>
                <code className="font-mono text-[0.7rem]">{d.email}</code>
              </button>
            ))}
          </div>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            Click a row to fill the form. Password: <code>demo1234</code> · admin: <code>admin</code>
          </p>
        </div>
      ) : null}
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(registerAction, null);
  const [createGym, setCreateGym] = useState(true);
  return (
    <form action={action} className="space-y-4">
      <ErrorBox message={state?.error} />
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required placeholder="Alex Nord" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <div className="subtle p-3">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="createGym"
            checked={createGym}
            onChange={(e) => setCreateGym(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">I run a gym</span>
            <span className="block" style={{ color: "var(--muted)" }}>
              Create your gym and set up memberships in a few minutes.
            </span>
          </span>
        </label>
        {createGym ? (
          <div className="mt-3">
            <Field label="Gym name" htmlFor="gymName">
              <Input id="gymName" name="gymName" placeholder="Nordic Fight Lab" />
            </Field>
          </div>
        ) : (
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            You&apos;ll join your gym with a code or invitation after signing up.
          </p>
        )}
      </div>
      <SubmitButton className="w-full" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
        Already have an account?{" "}
        <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
        By creating an account you accept the terms of service and privacy policy.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(requestPasswordResetAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.ok ? (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}>
          {state.ok}
        </div>
      ) : null}
      <ErrorBox message={state?.error} />
      <Field label="Email" htmlFor="email" hint="We'll email you a reset link valid for 60 minutes.">
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login" style={{ color: "var(--muted)" }}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <ErrorBox message={state?.error} />
      <Field label="New password" htmlFor="password">
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <SubmitButton className="w-full">Update password</SubmitButton>
    </form>
  );
}

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
            <span className="text-sm font-black">M</span>
          </span>
          MMA OS
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="card p-6">{children}</div>
      {footer ? <div className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>{footer}</div> : null}
    </div>
  );
}

export function LoadingSpinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}
