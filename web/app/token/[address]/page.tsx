import { TokenDetail } from "@/components/TokenDetail";

export default function TokenPage({ params }: { params: { address: string } }) {
  return <TokenDetail address={params.address} />;
}
