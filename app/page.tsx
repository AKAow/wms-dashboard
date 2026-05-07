import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5faff_0%,#eaf4ff_100%)] text-slate-900 flex items-center justify-center p-6">
      <div className="rounded-xl border border-[#d6e8ff] bg-white/80 px-6 py-5 text-center">
        <p className="text-sm text-slate-600 mb-2">WindTree WMS</p>
        <p className="text-base font-semibold text-slate-900 mb-3">대시보드로 이동해 주세요.</p>
        <Link href="/dashboard/" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          대시보드 열기
        </Link>
      </div>
    </main>
  );
}
