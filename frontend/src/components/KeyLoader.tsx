"use client";
/**
 * Lets an operator (carrier or arbiter) load their key file into memory.
 * The file never leaves the browser and is forgotten on page reload.
 */
import { useRef } from "react";
import { toast } from "sonner";
import { parseKeyFile } from "@/lib/program";
import { Button } from "./ui";

export function KeyLoader({
  label,
  onLoaded,
}: {
  label: string;
  onLoaded: (k: ReturnType<typeof parseKeyFile>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      onLoaded(parseKeyFile(await file.text()));
      toast.success("Key loaded (kept in this tab only)");
    } catch (err) {
      toast.error("Couldn't read key file", { description: (err as Error).message });
    }
    e.target.value = "";
  }

  return (
    <>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <Button variant="secondary" onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}
