import { createFileRoute, Link } from "@tanstack/react-router";
import { DeleteButton } from "@/components/DeleteButton";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "@/components/VehicleForm";
import { useRepo } from "@/hooks/use-repo";
import { customerName, repo } from "@/lib/repository";
import { displayPlate } from "@/lib/format";

export const Route = createFileRoute("/araclar/")({
  head: () => ({ meta: [{ title: "Araçlar — Anatek" }, { name: "description", content: "Plakaya göre araç kayıtları." }, { property: "og:title", content: "Araçlar — Anatek" }, { property: "og:description", content: "Plakaya göre araç kayıtları." }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const { data } = useRepo(() => repo.vehicles.list().map((v) => ({ v, c: repo.customers.get(v.customerId) })), []);
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-bold">Araçlar</h1><Button size="lg" onClick={() => setOpen(true)}>Yeni araç</Button></div>
      <table className="w-full text-base">
        <thead><tr className="border-b-2 text-left"><th className="py-2">Plaka</th><th>Araç</th><th>Tip</th><th>Müşteri</th><th></th></tr></thead>
        <tbody>{data.map(({ v, c }) => (
          <tr key={v.id} className="border-b"><td className="py-3"><Link to="/araclar/$id" params={{ id: v.id }} className="font-semibold text-primary underline">{displayPlate(v.plate)}</Link></td><td>{v.brand} {v.model} {v.year}</td><td>{v.type}</td><td>{c && customerName(c)}</td><td className="text-right"><DeleteButton kind="vehicle" id={v.id} label={displayPlate(v.plate)} size="sm" /></td></tr>
        ))}</tbody>
      </table>
      <VehicleForm open={open} onOpenChange={setOpen} />
    </section>
  );
}
