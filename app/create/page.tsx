import { CreateTokenForm } from "@/components/CreateTokenForm";

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Launch a token</h1>
        <p className="mt-1 text-slate-400">
          Deploy a fair-launch memecoin on the bonding curve. Free to create — you only pay gas.
        </p>
      </div>
      <CreateTokenForm />
    </div>
  );
}
