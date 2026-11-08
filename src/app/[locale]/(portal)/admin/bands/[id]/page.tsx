import { BandDetail } from "./BandDetail";

export default async function BandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BandDetail id={id} />;
}
