import { notFound } from "next/navigation";
import ModulePlaceholder from "@/components/ModulePlaceholder";
import { findModule } from "@/lib/navigation";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const item = findModule("RECRUITER", module);
  if (!item || item.live) notFound();

  return <ModulePlaceholder item={item} />;
}
