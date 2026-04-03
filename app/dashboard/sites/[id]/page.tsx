import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SiteDetailClient from "./SiteDetailClient";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase.from("sites").select("*").eq("id", id).single();
  if (!site) notFound();

  return <SiteDetailClient site={site} />;
}
