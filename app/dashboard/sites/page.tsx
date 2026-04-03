"use client";

import { Suspense } from "react";
import SitesContent from "./SitesContent";

export default function SitesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">로딩 중...</div>}>
      <SitesContent />
    </Suspense>
  );
}
