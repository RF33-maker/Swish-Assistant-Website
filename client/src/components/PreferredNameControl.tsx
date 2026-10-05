import { useEffect, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { checkPreferredName } from "@shared/preferredName";
import {
  getNameAccess,
  submitPreferredName,
  withdrawNameRequest,
  type NameRole,
  type PendingNameRequest,
} from "@/lib/preferredName";

interface Props {
  /** The profile's player record. */
  playerId: string;
  /** The name shown on the site today. */
  currentName: string;
  /** Other records for the same person (admins apply the name to all of them). */
  relatedPlayerIds?: string[];
  /** "inline" is a small button; "card" is a labelled section for settings pages. */
  variant?: "inline" | "card";
}

/**
 * Lets an admin set a player's preferred name straight away, and lets the
 * player who claimed the profile ask for one (an admin approves it). Renders
 * nothing for anyone else.
 */
export default function PreferredNameControl({ playerId, currentName, relatedPlayerIds, variant = "inline" }: Props) {
  const [role, setRole] = useState<NameRole>("none");
  const [pending, setPending] = useState<PendingNameRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNameAccess(playerId)
      .then((a) => { if (!cancelled) { setRole(a.role); setPending(a.pending); } })
      .catch(() => { if (!cancelled) setRole("none"); });
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => { if (open) { setValue(pending?.requested_name ?? currentName); setMessage(null); } }, [open, currentName, pending]);

  if (role === "none") return null;

  const check = checkPreferredName(value);
  const unchanged = check.ok && check.name.toLowerCase() === currentName.trim().toLowerCase();

  const submit = async () => {
    if (!check.ok || unchanged) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await submitPreferredName(playerId, check.name, role === "admin" ? relatedPlayerIds : undefined);
      if (res.applied) {
        setMessage({ type: "success", text: `Done. This profile is now "${res.name}". Reloading…` });
        window.setTimeout(() => window.location.reload(), 900);
      } else {
        setPending(res.pending ?? null);
        setMessage({ type: "success", text: "Request sent. An admin will review it, and your name will update once it's approved." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawNameRequest(playerId);
      setPending(null);
      setMessage({ type: "success", text: "Request withdrawn." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const trigger = (
    <button type="button" onClick={() => setOpen(true)} className="ch-btn ch-btn-ghost h-9 px-3 text-[13px]" data-testid="preferred-name-button">
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      {pending ? "Name request pending" : role === "admin" ? "Set preferred name" : "Change my name"}
    </button>
  );

  return (
    <>
      {variant === "card" ? (
        <section className="ch-card p-5" aria-labelledby="preferred-name-heading">
          <h2 id="preferred-name-heading" className="ch-eyebrow">Preferred name</h2>
          <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">
            Your name appears on the site as <strong className="text-[color:var(--ch-text)]">{currentName}</strong>. If you go by something else, ask for it here.
            An admin reviews every change, and your old name is kept so your games stay linked to you.
          </p>
          {pending && (
            <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">
              Waiting for approval: <strong className="text-[color:var(--ch-text)]">{pending.requested_name}</strong>
            </p>
          )}
          <div className="mt-3">{trigger}</div>
        </section>
      ) : (
        trigger
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sa-pro max-w-md border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] text-[color:var(--ch-text)]" overlayClassName="bg-black/70 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Preferred name</DialogTitle>
            <DialogDescription className="text-[color:var(--ch-text-2)]">
              {role === "admin"
                ? "Applies straight away to this player's profile and box scores. The old spelling is kept so new games stay linked to them."
                : "An admin reviews name changes before they appear. Your old name is kept so your games stay linked to you."}
            </DialogDescription>
          </DialogHeader>

          <label className="block text-[13px] font-medium" htmlFor="preferred-name-input">Name as you want it shown</label>
          <input
            id="preferred-name-input"
            className="ch-input h-11 px-3.5 text-[15px] w-full"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={120}
            autoComplete="off"
            disabled={busy}
          />
          {!check.ok && value.trim() && <p className="text-[12.5px] text-[color:var(--ch-loss)]" role="alert">{check.error}</p>}
          {unchanged && <p className="text-[12.5px] text-[color:var(--ch-muted)]">That is already the name on the site.</p>}

          {message && (
            <p className={`text-[13px] ${message.type === "error" ? "text-[color:var(--ch-loss)]" : "text-[color:var(--ch-win)]"}`} role={message.type === "error" ? "alert" : "status"}>
              {message.type === "success" && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
              {message.text}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {pending && role === "owner" && (
              <button type="button" className="ch-btn ch-btn-ghost h-9 px-3 text-[13px]" onClick={() => void withdraw()} disabled={busy}>
                Withdraw request
              </button>
            )}
            <button type="button" className="ch-btn ch-btn-primary h-9 px-4 text-[13px] disabled:opacity-50" onClick={() => void submit()} disabled={busy || !check.ok || unchanged}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {role === "admin" ? "Apply name" : "Send request"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
