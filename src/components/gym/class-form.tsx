import { Field, Input, Select, Textarea, Button } from "@/components/ui/primitives";
import type { ClassRow } from "@/db/schema";
import { parseJson } from "@/lib/utils";

type Option = { id: string; name: string };

export function ClassForm({
  action,
  orgId,
  coaches,
  locations,
  cls,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  orgId: string;
  coaches: Option[];
  locations: Option[];
  cls?: ClassRow;
  submitLabel: string;
}) {
  const rec = parseJson<{ days: number[]; time: string } | null>(cls?.recurrence, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      {cls ? <input type="hidden" name="classId" value={cls.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class name" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" required defaultValue={cls?.name} placeholder="MMA Fundamentals" />
        </Field>
        <Field label="Discipline" htmlFor="discipline">
          <Input id="discipline" name="discipline" required defaultValue={cls?.discipline} placeholder="MMA, Brazilian Jiu-Jitsu…" />
        </Field>
        <Field label="Level" htmlFor="level">
          <Select id="level" name="level" defaultValue={cls?.level ?? "all"}>
            <option value="all">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="kids">Kids</option>
          </Select>
        </Field>
        <Field label="Coach" htmlFor="coachMemberId">
          <Select id="coachMemberId" name="coachMemberId" defaultValue={cls?.coachMemberId ?? ""}>
            <option value="">Unassigned</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Location" htmlFor="locationId">
          <Select id="locationId" name="locationId" defaultValue={cls?.locationId ?? ""}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Capacity" htmlFor="capacity">
          <Input id="capacity" name="capacity" type="number" min={1} max={200} defaultValue={cls?.capacity ?? 20} required />
        </Field>
        <Field label="Duration (minutes)" htmlFor="durationMinutes">
          <Input id="durationMinutes" name="durationMinutes" type="number" min={15} max={240} step={5} defaultValue={cls?.durationMinutes ?? 60} required />
        </Field>
        <Field label="Repeat on days" htmlFor="days" hint="0 = Sunday … 6 = Saturday. Comma separated, e.g. 1,3,5">
          <Input id="days" name="days" defaultValue={rec?.days?.join(",") ?? "1,3"} />
        </Field>
        <Field label="Start time" htmlFor="time" hint="Local gym time">
          <Input id="time" name="time" type="time" defaultValue={rec?.time ?? "18:00"} />
        </Field>
        <Field label="Booking opens (days ahead)" htmlFor="bookingWindowDays">
          <Input id="bookingWindowDays" name="bookingWindowDays" type="number" min={0} max={60} defaultValue={cls?.bookingWindowDays ?? 14} />
        </Field>
        <Field label="Cancellation window (hours)" htmlFor="cancellationWindowHours">
          <Input id="cancellationWindowHours" name="cancellationWindowHours" type="number" min={0} max={72} defaultValue={cls?.cancellationWindowHours ?? 4} />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2">
          <Textarea id="description" name="description" defaultValue={cls?.description ?? ""} />
        </Field>
      </div>
      <Button type="submit">{submitLabel}</Button>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Sessions are generated automatically eight weeks ahead from the weekly pattern.
      </p>
    </form>
  );
}
