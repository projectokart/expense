import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  User, ImageIcon, Filter, Loader2, Search, Calendar,
  Trash2, Target, LayoutGrid, CheckCircle, XCircle, RefreshCw,
  FileSpreadsheet, ChevronLeft, ChevronRight
} from "lucide-react";
import ImagePreviewModal from "@/components/expense/ImagePreviewModal";

interface Props {
  expenses: any[];
  users: any[];
  uniqueUsers: string[];
  uniqueMissions: string[];
  filteredExpenses: any[];
  searchFilters: any;
  setSearchFilters: (f: any) => void;
  approveExpense: (id: string) => void;
  rejectExpense: (id: string) => void;
  deleteExpense: (id: string) => void;
  isActionLoading: string | null;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  exportCSV: () => void;
  isActive: boolean;
}

const PAGE_SIZE = 20;

// Lazy Image component — Intersection Observer se sirf viewport mein aane pe load hoga
function LazyImage({
  src, onClick
}: {
  src: string;
  onClick: () => void;
}) {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" } // 100px pehle se load start karo
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="mt-1.5 w-11 h-11 rounded-xl border border-slate-100 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/10 transition-all group relative bg-slate-50 flex-shrink-0"
    >
      {inView ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-slate-100 animate-pulse rounded-xl" />
          )}
          <img
            src={src}
            onLoad={() => setLoaded(true)}
            className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            alt="Receipt"
          />
          {loaded && (
            <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[6px] font-black text-white bg-black/40 px-1 py-0.5 rounded">VIEW</span>
            </div>
          )}
        </>
      ) : (
        // Placeholder jab tak viewport mein nahi aaya
        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
          <ImageIcon className="w-3 h-3 text-slate-300" />
        </div>
      )}
    </div>
  );
}

export default function ExpensesTab({
  filteredExpenses,
  uniqueUsers,
  uniqueMissions,
  searchFilters,
  setSearchFilters,
  approveExpense,
  rejectExpense,
  deleteExpense,
  isActionLoading,
  setDeleteConfirmId,
  exportCSV,
  isActive,
}: Props) {
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Images tab active hone ke baad hi dikhenge
  const [imagesEnabled, setImagesEnabled] = useState(false);

  // Tab active hone pe images enable karo
  useEffect(() => {
    if (isActive && !imagesEnabled) {
      // Thoda delay — pehle cards render ho jaayein
      const t = setTimeout(() => setImagesEnabled(true), 300);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  // Filter change pe page 1 pe reset
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredExpenses.length, searchFilters]);

  // Date-aware pagination — same date ka data kabhi split nahi hoga
  const allDates = useMemo(() => {
    const dates = Array.from(new Set(filteredExpenses.map((e: any) => e.date || "Unknown"))) as string[];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [filteredExpenses]);

  const allDateGroups = useMemo(() => {
    const g: Record<string, any[]> = {};
    filteredExpenses.forEach((e: any) => {
      const d = e.date || "Unknown";
      if (!g[d]) g[d] = [];
      g[d].push(e);
    });
    return g;
  }, [filteredExpenses]);

  // Pages banao — jab tak date add karte raho jab tak PAGE_SIZE na bhar jaye
  // Ek date kabhi 2 pages mein split nahi hogi
  const datePages = useMemo(() => {
    const pages: string[][] = [[]];
    let pageCount = 0;
    allDates.forEach(date => {
      const count = allDateGroups[date]?.length || 0;
      if (pageCount > 0 && pageCount + count > PAGE_SIZE) {
        pages.push([]);
        pageCount = 0;
      }
      pages[pages.length - 1].push(date);
      pageCount += count;
    });
    return pages.filter(p => p.length > 0);
  }, [allDates, allDateGroups]);

  const totalPages = Math.max(1, datePages.length);
  const currentPageDates = datePages[currentPage - 1] || [];
  const pageExpenses = currentPageDates.flatMap(d => allDateGroups[d] || []);

  const catColors: any = {
    travel: "bg-blue-50 text-blue-600 border-blue-100",
    meal: "bg-orange-50 text-orange-600 border-orange-100",
    hotel: "bg-purple-50 text-purple-600 border-purple-100",
    luggage: "bg-cyan-50 text-cyan-600 border-cyan-100",
    other: "bg-slate-50 text-slate-600 border-slate-100",
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-3 pb-24 animate-fade-in bg-gray-50/50 min-h-screen">

      {/* FILTER PANEL */}
      <div className="mx-4 mb-6">
        <div className="bg-[#F8F9FA] p-1.5 rounded-[2.5rem] shadow-inner border border-gray-100/50">
          <div className="bg-white p-5 rounded-[2.3rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">

            <div className="flex gap-3">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-[#4285F4] transition-colors" />
                <input type="text" placeholder="Search records..."
                  className="w-full bg-[#F1F3F4]/50 text-[12px] pl-10 pr-4 py-3 rounded-2xl outline-none font-medium border-2 border-transparent focus:bg-white focus:border-[#4285F4]/10 transition-all placeholder:text-gray-400"
                  value={searchFilters.searchQuery}
                  onChange={(e) => setSearchFilters({ ...searchFilters, searchQuery: e.target.value })} />
              </div>
              <button onClick={() => setSearchFilters({ searchQuery: "", userEmail: "all", missionName: "all", category: "all", startDate: "", endDate: "", status: "all" })}
                className="bg-[#F1F3F4] hover:bg-rose-50 hover:text-[#EA4335] p-3 rounded-2xl transition-all active:scale-90">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-50 py-1">
              <div className="relative px-2">
                <select className="w-full bg-transparent text-[10px] py-2 pl-6 outline-none font-bold text-gray-700 appearance-none cursor-pointer"
                  value={searchFilters.userEmail}
                  onChange={(e) => setSearchFilters({ ...searchFilters, userEmail: e.target.value })}>
                  <option value="all">Personnel</option>
                  {uniqueUsers.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4285F4] opacity-50" />
              </div>
              <div className="relative px-2">
                <select className="w-full bg-transparent text-[10px] py-2 pl-6 outline-none font-bold text-gray-700 appearance-none cursor-pointer"
                  value={searchFilters.missionName}
                  onChange={(e) => setSearchFilters({ ...searchFilters, missionName: e.target.value })}>
                  <option value="all">Mission</option>
                  {uniqueMissions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <Target className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-500/50" />
              </div>
              <div className="relative px-2">
                <select className="w-full bg-transparent text-[10px] py-2 pl-6 outline-none font-bold text-gray-700 appearance-none cursor-pointer"
                  value={searchFilters.category}
                  onChange={(e) => setSearchFilters({ ...searchFilters, category: e.target.value })}>
                  <option value="all">Category</option>
                  {["travel","meal","hotel","luggage","other"].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
                <LayoutGrid className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#34A853] opacity-50" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-1">
              <div className="flex items-center gap-2 bg-[#F1F3F4]/50 p-1 rounded-xl">
                <div className="flex items-center px-2 py-1 gap-1.5">
                  <Calendar className="w-2.5 h-2.5 text-gray-400" />
                  <input type="date" className="bg-transparent text-[9px] font-bold text-gray-500 outline-none w-24"
                    value={searchFilters.startDate}
                    onChange={(e) => setSearchFilters({ ...searchFilters, startDate: e.target.value })} />
                </div>
                <div className="w-[1px] h-3 bg-gray-300" />
                <div className="flex items-center px-2 py-1">
                  <input type="date" className="bg-transparent text-[9px] font-bold text-gray-500 outline-none w-24"
                    value={searchFilters.endDate}
                    onChange={(e) => setSearchFilters({ ...searchFilters, endDate: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-nowrap gap-1 w-full overflow-hidden">
                {["all","pending","approved","rejected"].map(s => {
                  const isActive = searchFilters.status === s;
                  const colors: any = {
                    all: isActive ? "bg-gray-800 text-white" : "bg-white text-gray-400",
                    pending: isActive ? "bg-[#FBBC05] text-white" : "bg-white text-gray-400",
                    approved: isActive ? "bg-[#34A853] text-white" : "bg-white text-gray-400",
                    rejected: isActive ? "bg-[#EA4335] text-white" : "bg-white text-gray-400",
                  };
                  return (
                    <button key={s} onClick={() => setSearchFilters({ ...searchFilters, status: s })}
                      className={`flex-1 min-w-0 py-2 rounded-full text-[7px] font-black uppercase transition-all border border-gray-100 truncate ${colors[s]} ${isActive ? "shadow-sm border-transparent scale-105" : ""}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results bar */}
      <div className="px-5 flex justify-between items-center">
        <span className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">
          {filteredExpenses.length} Records
          {totalPages > 1 && ` · Page ${currentPage}/${totalPages}`}
        </span>
        <button onClick={exportCSV} className="text-green-600 text-[8px] font-black uppercase border border-green-100 px-2 py-1 rounded-md flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3" /> CSV
        </button>
      </div>

      {/* Expense Cards — Date → User → Category grouping */}
      <div className="px-3 space-y-4">
        {filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-10 text-center border border-gray-50">
            <p className="text-[10px] font-black uppercase opacity-20 tracking-widest">No Records Found</p>
          </div>
        ) : (() => {
          // Left border colors per date index
          const leftColors = ["#3B82F6","#8B5CF6","#F59E0B","#10B981","#EF4444","#EC4899","#06B6D4"];

          // Group by date
          const dateGroups: Record<string, any[]> = {};
          pageExpenses.forEach((e: any) => {
            const d = e.date || "Unknown";
            if (!dateGroups[d]) dateGroups[d] = [];
            dateGroups[d].push(e);
          });
          const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

          return sortedDates.map((date, dateIdx) => {
            const lc = leftColors[dateIdx % leftColors.length];
            const dayExp = dateGroups[date];
            const dayTotal = dayExp.filter((e: any) => e.category !== "cash").reduce((s: number, e: any) => s + Number(e.amount), 0);
            const dayApproved = dayExp.filter((e: any) => e.status === "approved" && e.category !== "cash").reduce((s: number, e: any) => s + Number(e.amount), 0);
            const dayPending = dayExp.filter((e: any) => e.status === "pending").length;
            let formattedDate = date;
            try { formattedDate = new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }); } catch {}

            // Group by user
            const userGroups: Record<string, any[]> = {};
            dayExp.forEach((e: any) => {
              const u = e.profiles?.name || "Unknown";
              if (!userGroups[u]) userGroups[u] = [];
              userGroups[u].push(e);
            });

            return (
              <div key={date} className="bg-white rounded-[1.6rem] border border-gray-100 shadow-sm overflow-hidden">

                {/* DATE HEADER */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"
                  style={{background: lc, borderLeft: `4px solid ${lc}`}}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-white">{formattedDate}</span>
                    {dayPending > 0 && (
                      <span className="text-[6px] font-black bg-white/20 text-white px-1.5 py-0.5 rounded-full uppercase">{dayPending} pending</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[6px] font-black uppercase text-white/60">Approved</p>
                      <p className="text-[9px] font-black text-white">₹{dayApproved.toLocaleString()}</p>
                    </div>
                    <div className="text-right border-l border-white/20 pl-3">
                      <p className="text-[6px] font-black uppercase text-white/60">Total</p>
                      <p className="text-[9px] font-black text-white">₹{dayTotal.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* USER GROUPS */}
                <div className="divide-y divide-gray-100 bg-gray-50">
                  {Object.entries(userGroups).map(([userName, userExp], uIdx) => {
                    const userTotal = userExp.filter((e: any) => e.category !== "cash").reduce((s: number, e: any) => s + Number(e.amount), 0);

                    // Group by category
                    const catGroups: Record<string, any[]> = {};
                    userExp.forEach((e: any) => {
                      const c = e.category || "other";
                      if (!catGroups[c]) catGroups[c] = [];
                      catGroups[c].push(e);
                    });

                    const userBgs = ["#F0F7FF","#FFF7F0","#F0FFF4","#FDF4FF","#FFFBF0","#F0FFFF"];
                    const userBg = userBgs[uIdx % userBgs.length];
                    const userBorder = [
                      "#BFDBFE","#FED7AA","#BBF7D0","#E9D5FF","#FDE68A","#A5F3FC"
                    ][uIdx % 6];

                    return (
                      <div key={userName} className="mx-2 my-2 rounded-[1.2rem] overflow-hidden shadow-sm border"
                        style={{background: userBg, borderColor: userBorder}}>
                        {/* User row */}
                        <div className="flex items-center justify-between px-3.5 py-2.5 border-b"
                          style={{background: lc + "20", borderColor: userBorder}}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{background: lc}}>
                              {userName.charAt(0)}
                            </div>
                            <span className="text-[10px] font-black uppercase" style={{color: lc}}>{userName}</span>
                          </div>
                          <span className="text-[8px] font-black text-gray-500">₹{userTotal.toLocaleString()} · {userExp.length}</span>
                        </div>

                        {/* Category groups */}
                        {Object.entries(catGroups).map(([cat, catExp]) => {
                          const catTotal = catExp.filter((e: any) => e.category !== "cash").reduce((s: number, e: any) => s + Number(e.amount), 0);
                          const catStyle = catColors[cat] || catColors.other;
                          return (
                            <div key={cat}>
                              {/* Category strip */}
                              <div className="flex items-center justify-between px-4 py-1.5 border-b" style={{background: userBorder + "50", borderColor: userBorder + "80"}}>
                                <span className={`text-[7px] font-black uppercase tracking-widest ${catStyle.split(" ")[0]}`}>{cat}</span>
                                <span className={`text-[7px] font-black ${catStyle.split(" ")[0]}`}>₹{catTotal.toLocaleString()}</span>
                              </div>
                              {/* Expense rows */}
                              {catExp.map((e: any) => {
                                const receiptImage = e.image_url;
                                return (
                                  <div key={e.id} className="px-4 py-2.5 border-t" style={{borderColor: userBorder + "60"}}>
                                    <div className="flex justify-between items-start gap-2 mb-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-gray-800 leading-snug">{e.description || "No Description"}</p>
                                        {imagesEnabled && receiptImage ? (
                                          <LazyImage src={receiptImage} onClick={() => setSelectedPreviewImage(receiptImage)} />
                                        ) : receiptImage && !imagesEnabled ? (
                                          <div className="mt-1 w-8 h-8 rounded-lg bg-slate-100 border border-slate-100 flex items-center justify-center">
                                            <ImageIcon className="w-2.5 h-2.5 text-slate-300" />
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <p className="font-black text-[12px] text-gray-900">₹{Number(e.amount).toLocaleString()}</p>
                                        <span className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${
                                          e.status === "pending" ? "bg-amber-50 text-amber-500"
                                          : e.status === "approved" ? "bg-emerald-50 text-emerald-600"
                                          : "bg-rose-50 text-rose-600"
                                        }`}>{e.status}</span>
                                      </div>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex gap-1.5">
                                      {e.status === "pending" ? (
                                        <>
                                          <button onClick={() => approveExpense(e.id)}
                                            className="flex-[2] flex items-center justify-center gap-1 py-1.5 bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase active:scale-95 transition-all">
                                            <CheckCircle className="w-2.5 h-2.5" /> Approve
                                          </button>
                                          <button onClick={() => rejectExpense(e.id)}
                                            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-rose-50 text-rose-500 rounded-lg text-[8px] font-black uppercase border border-rose-100 active:scale-95 transition-all">
                                            <XCircle className="w-2.5 h-2.5" /> Reject
                                          </button>
                                        </>
                                      ) : (
                                        <button onClick={() => e.status === "approved" ? rejectExpense(e.id) : approveExpense(e.id)}
                                          className={`flex-[3] flex items-center justify-center gap-1 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all active:scale-95 ${
                                            e.status === "approved" ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                          }`}>
                                          <RefreshCw className="w-2.5 h-2.5" />
                                          {e.status === "approved" ? "Revert" : "Approve"}
                                        </button>
                                      )}
                                      <button onClick={() => setDeleteConfirmId(e.id)} disabled={isActionLoading === e.id}
                                        className="w-7 h-7 bg-gray-50 text-gray-400 hover:text-rose-500 rounded-lg flex items-center justify-center border border-gray-100 active:scale-95 transition-all disabled:opacity-50">
                                        {isActionLoading === e.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="px-3 py-4">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-3 flex items-center justify-between gap-2">
            <button
              onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo(0,0); }}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gray-50 text-gray-600 hover:bg-gray-100 active:scale-95">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>

            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, i) =>
                page === "..." ? (
                  <span key={`dot-${i}`} className="text-[10px] text-gray-300 font-black px-1">···</span>
                ) : (
                  <button key={page} onClick={() => { setCurrentPage(Number(page)); window.scrollTo(0,0); }}
                    className={`w-8 h-8 rounded-xl text-[9px] font-black transition-all active:scale-95 ${
                      currentPage === page ? "bg-gray-900 text-white shadow-sm" : "text-gray-400 hover:bg-gray-50"
                    }`}>
                    {page}
                  </button>
                )
              )}
            </div>

            <button
              onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0,0); }}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gray-50 text-gray-600 hover:bg-gray-100 active:scale-95">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-center text-[8px] font-black uppercase opacity-20 tracking-widest mt-2">
            Showing {pageExpenses.length} of {filteredExpenses.length} · Page {currentPage}/{totalPages}
          </p>
        </div>
      )}

      <ImagePreviewModal imageUrl={selectedPreviewImage} onClose={() => setSelectedPreviewImage(null)} />
    </div>
  );
}