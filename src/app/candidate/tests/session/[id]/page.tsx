import TestRunner from "./TestRunner";

export default async function TestSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TestRunner sessionId={id} />;
}
