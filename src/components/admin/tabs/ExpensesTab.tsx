import { useState, useEffect, useRef, useMemo } from "react";
import {
  User, ImageIcon, Loader2, Search, Calendar,
  Trash2, Target, LayoutGrid, CheckCircle, XCircle, RefreshCw,
  FileSpreadsheet, ChevronLeft, ChevronRight, ChevronDown, X
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

function LazyImage({ src, onClick }: { src: string; onClick: () => void }) {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} onClick={onClick}
      className="mt-1.5 w-11 h-11 rounded-xl border border-slate-100 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/10 transition-all group relative bg-slate-50 flex-shrink-0">
      {inView ? (
        <>
          {!loaded && <div className="absolute inset-0 bg-slate-100 animate-pulse rounded-xl" />}
          <img src={src} onLoad={() => setLoaded(true)}
            className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            alt="Receipt" />
          {loaded && (
            <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[6px] font-black text-white bg-black/40 px-1 py-0.5 rounded">VIEW</span>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
          <ImageIcon className="w-3 h-3 text-slate-300" />
        </div>
      )}
    </div>
  );
}

// ─── Multi-User Checkbox Dropdown ─────────────────────────────────────────────
function MultiUserDropdown({
  uniqueUsers,
  selectedUsers,
  onChange,
}: {
  uniqueUsers: string[];
  selectedUsers: string[];
  onChange: (users: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleUser = (name: string) => {
    if (selectedUsers.includes(name)) {
      onChange(selectedUsers.filter(u => u !== name));
    } else {
      onChange([...selectedUsers, name]);
    }
  };

  const label =
    selectedUsers.length === 0 ? "Personnel"
    : selectedUsers.length === 1 ? selectedUsers[0].split(" ")[0]
    : `${selectedUsers.length} Selected`;

  return (
    <div ref={ref} className="relative px-2">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-1 py-2 outline-none">
        <User className="w-3 h-3 text-[#4285F4] opacity-50 flex-shrink-0" />
        <span className="text-[10px] font-bold text-gray-700 truncate flex-1 text-left">{label}</span>
        {selectedUsers.length > 0 ? (
          <button onClick={e => { e.stopPropagation(); onChange([]); }}
            className="w-3.5 h-3.5 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center flex-shrink-0">
            <X className="w-2 h-2" />
          </button>
        ) : (
          <ChevronDown className={`w-2.5 h-2.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => onChange(selectedUsers.length === uniqueUsers.length ? [] : [...uniqueUsers])}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50">
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
              selectedUsers.length === uniqueUsers.length ? "bg-[#4285F4] border-[#4285F4]" : "border-gray-300"
            }`}>
              {selectedUsers.length === uniqueUsers.length && (
                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-[9px] font-black uppercase text-gray-500">
              {selectedUsers.length === uniqueUsers.length ? "Deselect All" : "Select All"}
            </span>
          </button>

          <div className="max-h-52 overflow-y-auto py-1">
            {uniqueUsers.map(name => {
              const checked = selectedUsers.includes(name);
              return (
                <button key={name} onClick={() => toggleUser(name)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    checked ? "bg-[#4285F4] border-[#4285F4]" : "border-gray-300"
                  }`}>
                    {checked && (
                      <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="w-5 h-5 rounded-md bg-[#4285F4]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[7px] font-black text-[#4285F4]">{name.charAt(0)}</span>
                  </div>
                  <span className="text-[9px] font-bold text-gray-700 truncate">{name}</span>
                </button>
              );
            })}
          </div>

          {selectedUsers.length > 0 && (
            <div className="border-t border-gray-50 px-3 py-1.5 bg-blue-50/50">
              <span className="text-[8px] font-black text-[#4285F4] uppercase">
                {selectedUsers.length} user{selectedUsers.length > 1 ? "s" : ""} selected
              </span>
            </div>
          )}
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
  isActionLoading,
  setDeleteConfirmId,
  exportCSV,
  isActive,
}: Props) {
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [imagesEnabled, setImagesEnabled] = useState(false);

  useEffect(() => {
    if (isActive && !imagesEnabled) {
      const t = setTimeout(() => setImagesEnabled(true), 300);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  useEffect(() => { setCurrentPage(1); }, [filteredExpenses.length, searchFilters]);

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

  const datePages = useMemo(() => {
    const pages: string[][] = [[]];
    let pageCount = 0;
    allDates.forEach(date => {
      const count = allDateGroups[date]?.length || 0;
      if (pageCount > 0 && pageCount + count > PAGE_SIZE) { pages.push([]); pageCount = 0; }
      pages[pages.length - 1].push(date);
      pageCount += count;
    });
    return pages.filter(p => p.length > 0);
  }, [allDates, allDateGroups]);

  const totalPages = Math.max(1, datePages.length);
  const currentPageDates = datePages[currentPage - 1] || [];
  const pageExpenses = currentPageDates.flatMap(d => allDateGroups[d] || []);

  const catColors: any = {
    travel: "bg-blue-50 text-blue-600",
    meal: "bg-orange-50 text-orange-600",
    hotel: "bg-purple-50 text-purple-600",
    luggage: "bg-cyan-50 text-cyan-600",
    other: "bg-slate-50 text-slate-600",
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

  const selectedUsers: string[] = searchFilters.userEmails ?? [];

  const resetFilters = () => setSearchFilters({
    searchQuery: "", userEmails: [], missionName: "all",
    category: "all", startDate: "", endDate: "", status: "all"
  });

  return (
    <div className="space-y-3 pb-24 bg-gray-50/50 min-h-screen">

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
                  onChange={e => setSearchFilters({ ...searchFilters, searchQuery: e.target.value })} />
              </div>
              <button onClick={resetFilters}
                className="bg-[#F1F3F4] hover:bg-rose-50 hover:text-[#EA4335] p-3 rounded-2xl transition-all active:scale-90">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* User | Mission | Category */}
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-50 py-1">
              <MultiUserDropdown
                uniqueUsers={uniqueUsers}
                selectedUsers={selectedUsers}
                onChange={users => setSearchFilters({ ...searchFilters, userEmails: users })}
              />
              <div className="relative px-2">
                <select className="w-full bg-transparent text-[10px] py-2 pl-6 outline-none font-bold text-gray-700 appearance-none cursor-pointer"
                  value={searchFilters.missionName}
                  onChange={e => setSearchFilters({ ...searchFilters, missionName: e.target.value })}>
                  <option value="all">Mission</option>
                  {uniqueMissions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <Target className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-purple-500/50" />
              </div>
              <div className="relative px-2">
                <select className="w-full bg-transparent text-[10px] py-2 pl-6 outline-none font-bold text-gray-700 appearance-none cursor-pointer"
                  value={searchFilters.category}
                  onChange={e => setSearchFilters({ ...searchFilters, category: e.target.value })}>
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
                    onChange={e => setSearchFilters({ ...searchFilters, startDate: e.target.value })} />
                </div>
                <div className="w-[1px] h-3 bg-gray-300" />
                <div className="flex items-center px-2 py-1">
                  <input type="date" className="bg-transparent text-[9px] font-bold text-gray-500 outline-none w-24"
                    value={searchFilters.endDate}
                    onChange={e => setSearchFilters({ ...searchFilters, endDate: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-nowrap gap-1 w-full overflow-hidden">
                {["all","pending","approved","rejected"].map(s => {
                  const isAct = searchFilters.status === s;
                  const colors: any = {
                    all: isAct ? "bg-gray-800 text-white" : "bg-white text-gray-400",
                    pending: isAct ? "bg-[#FBBC05] text-white" : "bg-white text-gray-400",
                    approved: isAct ? "bg-[#34A853] text-white" : "bg-white text-gray-400",
                    rejected: isAct ? "bg-[#EA4335] text-white" : "bg-white text-gray-400",
                  };
                  return (
                    <button key={s} onClick={() => setSearchFilters({ ...searchFilters, status: s })}
                      className={`flex-1 min-w-0 py-2 rounded-full text-[7px] font-black uppercase transition-all border border-gray-100 truncate ${colors[s]} ${isAct ? "shadow-sm border-transparent scale-105" : ""}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected user chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-50">
                {selectedUsers.map(name => (
                  <span key={name}
                    className="inline-flex items-center gap-1 bg-[#4285F4]/10 text-[#4285F4] text-[8px] font-black px-2 py-1 rounded-full border border-[#4285F4]/20">
                    <span className="w-3 h-3 bg-[#4285F4] rounded-full flex items-center justify-center text-white text-[5px] font-black">
                      {name.charAt(0)}
                    </span>
                    {name.split(" ")[0]}
                    <button onClick={() => setSearchFilters({ ...searchFilters, userEmails: selectedUsers.filter(u => u !== name) })}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity">
                      <X className="w-2 h-2" />
                    </button>
                  </span>
                ))}
                <button onClick={() => setSearchFilters({ ...searchFilters, userEmails: [] })}
                  className="text-[7px] font-black text-gray-400 hover:text-rose-500 uppercase px-1 transition-colors">
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results bar */}
      <div className="px-5 flex justify-between items-center">
        <span className="text-[8px] font-black uppercase opacity-30 tracking-[0.2em]">
          {filteredExpenses.length} Records
          {totalPages > 1 && ` · Page ${currentPage}/${totalPages}`}
        </span>
        <button onClick={exportCSV}
          className="text-green-600 text-[8px] font-black uppercase border border-green-100 px-2 py-1 rounded-md flex items-center gap-1">
          <FileSpreadsheet className="w-3 h-3" /> CSV
        </button>
      </div>

      {/* Expense Cards */}
      <div className="px-3 space-y-4">
        {filteredExpenses.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-10 text-center border border-gray-50">
            <p className="text-[10px] font-black uppercase opacity-20 tracking-widest">No Records Found</p>
          </div>
        ) : (() => {
          const leftColors = ["#3B82F6","#8B5CF6","#F59E0B","#10B981","#EF4444","#EC4899","#06B6D4"];
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

            const userGroups: Record<string, any[]> = {};
            dayExp.forEach((e: any) => {
              const u = e.profiles?.name || "Unknown";
              if (!userGroups[u]) userGroups[u] = [];
              userGroups[u].push(e);
            });

            return (
              <div key={date} className="bg-white rounded-[1.6rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"
                  style={{ background: lc, borderLeft: `4px solid ${lc}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-white">{formattedDate}</span>
                    {dayPending > 0 && (
                      <span className="text-[6px] font-black bg-white/20 text-white px-1.5 py-0.5 rounded-full uppercase">{dayPending} pending</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[6px] font-black uppercase text-white/60">Approved</p>
                      <p className="text-[9px] font-black text-white">Rs.{dayApproved.toLocaleString()}</p>
                    </div>
                    <div className="text-right border-l border-white/20 pl-3">
                      <p className="text-[6px] font-black uppercase text-white/60">Total</p>
                      <p className="text-[9px] font-black text-white">Rs.{dayTotal.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 bg-gray-50">
                  {Object.entries(userGroups).map(([userName, userExp], uIdx) => {
                    const userTotal = userExp.filter((e: any) => e.category !== "cash").reduce((s: number, e: any) => s + Number(e.amount), 0);
                    const catGroups: Record<string, any[]> = {};
                    userExp.forEach((e: any) => {
                      const c = e.category || "other";
                      if (!catGroups[c]) catGroups[c] = [];
                      catGroups[c].push(e);
                    });
                    const userBgs = ["#F0F7FF","#FFF7F0","#F0FFF4","#FDF4FF","#FFFBF0","#F0FFFF"];
                    const userBg = userBgs[uIdx % userBgs.length];
                    const userBorder = ["#BFDBFE","#FED7AA","#BBF7D0","#E9D5FF","#FDE68A","#A5F3FC"][uIdx % 6];

                    return (
                      <div key={userName} className="mx-2 my-2 rounded-[1.2rem] overflow-hidden shadow-sm border"
                        style={{ background: userBg, borderColor: userBorder }}>
                        <div className="flex items-center justify-between px-3.5 py-2.5 border-b"
                          style={{ background: lc + "20", borderColor: userBorder }}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ background: lc }}>
                              {userName.charAt(0)}
                            </div>
                            <span className="text-[10px] font-black uppercase" style={{ color: lc }}>{userName}</span>
                          </div>
                          <span className="text-[8px] font-black text-gray-500">Rs.{userTotal.toLocaleString()} {userExp.length}</span>
                        </div>

                        {Object.entries(catGroups).map(([cat, catExp]) => {
                          const catTotal = catExp.filter((e: any) => e.category !== "cash").reduce((s: number, e: any) => s + Number(e.amount), 0);
                          const catStyle = catColors[cat] || catColors.other;
                          return (
                            <div key={cat}>
                              <div className="flex items-center justify-between px-4 py-1.5 border-b"
                                style={{ background: userBorder + "50", borderColor: userBorder + "80" }}>
                                <span className={`text-[7px] font-black uppercase tracking-widest ${catStyle}`}>{cat}</span>
                                <span className={`text-[7px] font-black ${catStyle}`}>Rs.{catTotal.toLocaleString()}</span>
                              </div>
                              {catExp.map((e: any) => {
                                const receiptImage = e.image_url;
                                return (
                                  <div key={e.id} className="px-4 py-2.5 border-t" style={{ borderColor: userBorder + "60" }}>
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
                                        <p className="font-black text-[12px] text-gray-900">Rs.{Number(e.amount).toLocaleString()}</p>
                                        <span className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${
                                          e.status === "pending" ? "bg-amber-50 text-amber-500"
                                          : e.status === "approved" ? "bg-emerald-50 text-emerald-600"
                                          : "bg-rose-50 text-rose-600"
                                        }`}>{e.status}</span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                      {e.status === "pending" ? (
                                        <>
                                          <button onClick={() => approveExpense(e.id)}
                                            className="flex-[2] flex items-center justify-center gap-1 py-1.5 bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase active:scale-95 transition-all">
                                            <CheckCircle className="w-2.5 h-2.5" /> Approve
                                          </button>
                                          <button onClick={() => {}}
                                            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-rose-50 text-rose-500 rounded-lg text-[8px] font-black uppercase border border-rose-100 active:scale-95 transition-all">
                                            <XCircle className="w-2.5 h-2.5" /> Reject
                                          </button>
                                        </>
                                      ) : (
                                        <button onClick={() => e.status === "approved" ? {} : approveExpense(e.id)}
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
            <button onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo(0,0); }} disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all disabled:opacity-30 bg-gray-50 text-gray-600 hover:bg-gray-100 active:scale-95">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, i) =>
                page === "..." ? (
                  <span key={`dot-${i}`} className="text-[10px] text-gray-300 font-black px-1">...</span>
                ) : (
                  <button key={page} onClick={() => { setCurrentPage(Number(page)); window.scrollTo(0,0); }}
                    className={`w-8 h-8 rounded-xl text-[9px] font-black transition-all active:scale-95 ${currentPage === page ? "bg-gray-900 text-white shadow-sm" : "text-gray-400 hover:bg-gray-50"}`}>
                    {page}
                  </button>
                )
              )}
            </div>
            <button onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0,0); }} disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all disabled:opacity-30 bg-gray-50 text-gray-600 hover:bg-gray-100 active:scale-95">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-center text-[8px] font-black uppercase opacity-20 tracking-widest mt-2">
            Showing {pageExpenses.length} of {filteredExpenses.length} - Page {currentPage}/{totalPages}
          </p>
        </div>
      )}

      <ImagePreviewModal imageUrl={selectedPreviewImage} onClose={() => setSelectedPreviewImage(null)} />
    </div>
  );
}
