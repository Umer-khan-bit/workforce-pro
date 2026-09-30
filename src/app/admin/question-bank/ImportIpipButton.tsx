"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ImportIpipButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function handleImport() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/questions/import-ipip", { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    setFailed(!res.ok);
    if (!res.ok) {
      setMessage(data?.error ?? "Import failed.");
      return;
    }
    setMessage(`Imported ${data.created} new item(s); ${data.skipped} already in the bank.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={handleImport} disabled={busy} className="btn-secondary">
        {busy ? "Importing..." : "Import IPIP Big Five (50 items)"}
      </button>
      {message && (
        <p role="status" className={`text-sm ${failed ? "text-red-600" : "text-green-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
