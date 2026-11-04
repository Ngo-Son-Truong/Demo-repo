import { ChillSpace } from "@/components/ChillSpace";

export const metadata = {
  title: "Bạn được mời vào một bàn · CHILLSPACE",
};

export default function JoinPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code ?? "").toUpperCase();
  return <ChillSpace initialInviteCode={code} />;
}
