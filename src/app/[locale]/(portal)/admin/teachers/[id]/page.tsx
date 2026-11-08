import { TeacherDetail } from "./TeacherDetail";

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeacherDetail id={id} />;
}
