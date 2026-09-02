import { createElement, useState, type ChangeEvent, type FormEvent } from "react";
import type { ApiTarget } from "./api-targets";
import { useT } from "./i18n/shared";
import { submitConnectPairing } from "./connect-pairing-transport";

export function ConnectPairingForm({
  target,
  onConnected,
}: {
  target: ApiTarget;
  onConnected: () => void;
}) {
  const t = useT();
  const [grant, setGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await submitConnectPairing(target, grant);
      onConnected();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return createElement("section", { className: "card connect-pairing", "aria-labelledby": "connect-pairing-title" },
    createElement("h2", { id: "connect-pairing-title" }, t("connection.pairing.title")),
    createElement("p", null, t(target.transport === "relay" ? "connection.pairing.relayWarning" : "connection.pairing.body")),
    createElement("form", { onSubmit: submit, className: "api-form-row" },
      createElement("label", { htmlFor: "connect-pairing-code", className: "field-label" }, t("connection.pairing.code")),
      createElement("input", {
        id: "connect-pairing-code",
        name: "pairingCode",
        value: grant,
        onChange: (event: ChangeEvent<HTMLInputElement>) => setGrant(event.currentTarget.value),
        autoComplete: "off",
        spellCheck: false,
        disabled: busy,
        className: "input mono",
        "aria-invalid": error || undefined,
        "aria-describedby": error ? "connect-pairing-error" : undefined,
      }),
      createElement("button", { type: "submit", className: "btn btn-primary", disabled: busy || !grant.trim() },
        t(busy ? "connection.pairing.submitting" : "connection.pairing.submit")),
      error ? createElement("p", { id: "connect-pairing-error", className: "alert alert-err", role: "alert" }, t("connection.pairing.error")) : null,
    ),
  );
}
