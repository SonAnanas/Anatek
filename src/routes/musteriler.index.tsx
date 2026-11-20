import { createFileRoute, Link } from "@tanstack/react-router";
import { DeleteButton } from "@/components/DeleteButton";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerForm } from "@/components/CustomerForm";
import { useRepo } from "@/hooks/use-repo";
import { customerName, searchCustomers, vehiclesOfCustomer } from "@/lib/repository";

export const Route = createFileRoute("/musteriler/")({
  head: () => ({ meta: [{ title: "Müşteriler — Anatek" }, { name: "description", content: "Müşteri kayıtları, arama ve ekleme." }, { property: "og:title", content: "Müşteriler — Anatek" }, { property: "og:description", content: "Müşteri kayıtları, arama ve ekleme." }] }),
  component: Page,
});

function Page() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useRepo(() => searchCustomers(q), [], [q]);
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-bold">Müşteriler</h1><Button size="lg" onClick={() => setOpen(true)}>Yeni müşteri</Button></div>
      <Input className="h-11 max-w-md text-base" placeholder="Ad, soyad veya telefonla ara" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="w-full text-base">
        <thead><tr className="border-b-2 text-left"><th className="py-2">Ad soyad</th><th>Telefon</th><th className="amount">Araç</th><th></th></tr></thead>
        <tbody>{data.map((c) => (
          <tr key={c.id} className="border-b"><td className="py-3"><Link to="/musteriler/$id" params={{ id: c.id }} className="font-semibold text-primary underline">{customerName(c)}</Link></td><td>{c.phone}</td><td className="amount">{vehiclesOfCustomer(c.id).length}</td><td className="text-right"><DeleteButton kind="customer" id={c.id} label={customerName(c)} size="sm" /></td></tr>
        ))}</tbody>
      </table>
      <CustomerForm open={open} onOpenChange={setOpen} />
    </section>
  );
}
