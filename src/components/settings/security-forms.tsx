"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { changePasswordAction, disableMfaAction, enableMfaAction, type AuthFormState } from "@/lib/actions/auth";
import { Field, Input, Callout } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";

function State({ state }: { state: AuthFormState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--danger)" }} role="alert">
        <AlertCircle className="h-3.5 w-3.5" /> {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent)" }}>
        <CheckCircle2 className="h-3.5 w-3.5" /> {state.ok}
      </p>
    );
  }
  return null;
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(changePasswordAction, null);
  return (
    <form action={action} className="mt-3 space-y-3">
      <State state={state} />
      <Field label="Current password"><Input name="current" type="password" required autoComplete="current-password" /></Field>
      <Field label="New password" hint="At least 8 characters."><Input name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Confirm new password"><Input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></Field>
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}

export function MfaSetup({ secret, otpauth, enabled }: { secret: string; otpauth: string; enabled: boolean }) {
  const [enableState, enableAction] = useActionState<AuthFormState, FormData>(enableMfaAction, null);
  const [disableState, disableAction] = useActionState<AuthFormState, FormData>(disableMfaAction, null);
  const [copied, setCopied] = useState(false);

  if (enabled) {
    return (
      <div className="mt-3 space-y-3">
        <p className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" style={{ color: "var(--accent)" }} /> Two-factor authentication is on.</p>
        <State state={disableState} />
        <form action={disableAction} className="space-y-2">
          <Field label="Password to disable 2FA"><Input name="password" type="password" required autoComplete="current-password" /></Field>
          <SubmitButton variant="secondary" size="sm">Turn off 2FA</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <Callout tone="info" title="Recommended for administrators">
        Add this account to any TOTP authenticator app (1Password, Authy, Google Authenticator).
        <span className="mt-2 block break-all font-mono text-xs">Secret: {secret}</span>
        <span className="mt-1 block break-all font-mono text-[0.65rem]">{otpauth}</span>
      </Callout>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(secret);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy secret"}
      </button>
      <State state={enableState} />
      <form action={enableAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="secret" value={secret} />
        <div className="flex-1"><Field label="6-digit code"><Input name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required placeholder="000000" /></Field></div>
        <SubmitButton size="sm">Turn on 2FA</SubmitButton>
      </form>
    </div>
  );
}
