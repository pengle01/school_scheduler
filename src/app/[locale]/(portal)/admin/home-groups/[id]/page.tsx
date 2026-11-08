import { HomeGroupDetail } from "./HomeGroupDetail";

export default async function HomeGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HomeGroupDetail id={id} />;
}
