"use client";

import { useActionState } from "react";
import { reverifySites } from "../actions";

export function ReverifyButton({ count }: { count: number }) {
  const [result, action, pending] = useActionState(reverifySites, null);

  return (
    <form action={action} className="tool">
      <button disabled={pending} className="btn">
        {pending ? "Reverificando…" : `Reverificar sites com erro (${count})`}
      </button>
      {result && <p className="faint text-xs">{result.message}</p>}
    </form>
  );
}
