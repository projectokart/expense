import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Camera, Eye, Save, X, Loader2, MessageSquareText,
  ChevronDown, Lock as LockKeyhole, ChevronRight, MapPin, Users as UsersIcon, FileText, Trash2,
  BadgeCheck, CircleDollarSign, FileBarChart2
} from "lucide-react";
import ImagePreviewModal from "./ImagePreviewModal";
import MissionGallery from "./MissionGallery";

const CATEGORY_DOT_COLORS: Record<string, string> = {
  travel: "bg-category-travel",
  meal: "bg-category-meal",
  hotel: "bg-category-hotel",
  luggage: "bg-category-luggage",
  cash: "bg-category-cash",
  other: "bg-category-other",
};

const CATEGORIES = ["travel", "meal", "hotel", "luggage", "cash", "other"];

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-status-pending/20 text-status-pending",
  approved: "bg-status-approved/20 text-status-approved",
  rejected: "bg-status-rejected/20 text-status-rejected",
  settled: "bg-status-settled/20 text-status-settled",
};

interface Mission {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: string;
}

interface Expense {
  id: string;
  mission_id: string | null;
  date: string;
  category: string;
  description: string;
  amount: number;
  number_of_people: number;
  image_url: string | null;
  status: string;
  approved_by: string | null;
  rejected_reason: string | null;
  admin_note: string | null;
}

interface EditValues {
  description: string;
  amount: string;
  date: string;
  category: string;
  number_of_people: string;
  removeImage: boolean;
}

interface Props {
  userId: string;
  refreshKey: number;
  settlements?: any[];
  userName?: string;
}

export default function JourneyLogbook({ userId, refreshKey, settlements = [], userName = "User" }: Props) {

  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ [key: string]: File | null }>({});
  const [localPreview, setLocalPreview] = useState<{ [key: string]: string | null }>({});

  const handleFileSelect = (entryId: string, file: File) => {
    setSelectedFile(prev => ({ ...prev, [entryId]: file }));
    setLocalPreview(prev => ({ ...prev, [entryId]: URL.createObjectURL(file) }));
  };

  const [missions, setMissions] = useState<Mission[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({
    description: "",
    amount: "",
    date: "",
    category: "",
    number_of_people: "1",
    removeImage: false,
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const fetchData = async () => {
      const [missionsRes, expensesRes] = await Promise.all([
        supabase.from("missions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").eq("user_id", userId).order("date", { ascending: true }),
      ]);
      setMissions(missionsRes.data || []);
      setExpenses(expensesRes.data || []);
    };
    fetchData();
  }, [userId, refreshKey]);

  const activeMissions = missions.filter(m => m.status === "active" || m.status === "pending");
  const oldMissions = missions.filter(m => m.status === "finished" || m.status === "completed");

  const getExpensesForMission = (missionId: string) => expenses.filter(e => e.mission_id === missionId);

  const groupByDate = (items: Expense[]) => {
    const grouped: Record<string, Expense[]> = {};
    items.forEach(e => {
      if (!grouped[e.date]) grouped[e.date] = [];
      grouped[e.date].push(e);
    });
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  };

  const getMissionSettlementStatus = (missionId: string) => {
    const mExp = expenses.filter(e => e.mission_id === missionId && e.status === "approved" && e.category !== "cash");
    const mSet = settlements.filter((s: any) => s.mission_id === missionId);
    const spent = mExp.reduce((s, e) => s + Number(e.amount), 0);
    const received = mSet.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const pending = spent - received;
    return { spent, received, pending, isSettled: spent > 0 && pending <= 0, hasExpenses: spent > 0 };
  };

  const toggleMission = (missionId: string) => {
    setExpandedMissions(prev => {
      const next = new Set(prev);
      next.has(missionId) ? next.delete(missionId) : next.add(missionId);
      return next;
    });
  };

  const toggleDate = (key: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const startEdit = (entry: Expense) => {
    setEditingRow(entry.id);
    setEditValues({
      description: entry.description,
      amount: String(entry.amount),
      date: entry.date,
      category: entry.category,
      number_of_people: String(entry.number_of_people ?? 1),
      removeImage: false,
    });
    setSelectedFile(prev => ({ ...prev, [entry.id]: null }));
    setLocalPreview(prev => ({ ...prev, [entry.id]: null }));
  };

  const saveEdit = async (entryId: string) => {
    setSavingId(entryId);
    const currentEntry = expenses.find(e => e.id === entryId);
    let finalImageUrl = currentEntry?.image_url || null;

    try {
      if (editValues.removeImage && !selectedFile[entryId]) {
        if (currentEntry?.image_url) {
          const oldPath = currentEntry.image_url.split("/expense-receipts/")[1];
          if (oldPath) await supabase.storage.from("expense-receipts").remove([oldPath]);
        }
        finalImageUrl = null;
      }

      if (selectedFile[entryId]) {
        const file = selectedFile[entryId]!;
        const fileExt = file.name.split(".").pop();
        const filePath = `${userId}/${Date.now()}.${fileExt}`;

        if (currentEntry?.image_url) {
          const oldPath = currentEntry.image_url.split("/expense-receipts/")[1];
          if (oldPath) await supabase.storage.from("expense-receipts").remove([oldPath]);
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("expense-receipts")
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

        const { data: urlData } = supabase.storage.from("expense-receipts").getPublicUrl(uploadData.path);
        finalImageUrl = urlData.publicUrl;
      }

      const { error: dbError } = await supabase
        .from("expenses")
        .update({
          description: editValues.description,
          amount: parseFloat(editValues.amount) || 0,
          date: editValues.date,
          category: editValues.category,
          number_of_people: parseInt(editValues.number_of_people) || 1,
          image_url: finalImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entryId);

      if (dbError) throw new Error("Database update failed: " + dbError.message);

      toast.success("Expense updated!");
      setExpenses(prev => prev.map(e => e.id === entryId ? {
        ...e,
        description: editValues.description,
        amount: parseFloat(editValues.amount) || 0,
        date: editValues.date,
        category: editValues.category,
        number_of_people: parseInt(editValues.number_of_people) || 1,
        image_url: finalImageUrl,
      } : e));

      setEditingRow(null);
      setSelectedFile(prev => ({ ...prev, [entryId]: null }));
      setLocalPreview(prev => ({ ...prev, [entryId]: null }));

    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSavingId(null);
    }
  };

  const deleteExpense = async (entryId: string) => {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    setDeletingId(entryId);
    try {
      const entry = expenses.find(e => e.id === entryId);
      if (entry?.image_url) {
        const oldPath = entry.image_url.split("/expense-receipts/")[1];
        if (oldPath) await supabase.storage.from("expense-receipts").remove([oldPath]);
      }
      const { error } = await supabase.from("expenses").delete().eq("id", entryId);
      if (error) throw new Error(error.message);
      toast.success("Expense deleted");
      setExpenses(prev => prev.filter(e => e.id !== entryId));
      setExpandedEntry(null);
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const renderExpenseEntry = (entry: Expense, editable: boolean) => {
    const isDetailOpen = expandedEntry === entry.id;
    const isApproved = entry.status === "approved" || entry.status === "settled";
    const isEditing = editingRow === entry.id;
    const currentImageToShow = localPreview[entry.id] || (isEditing && editValues.removeImage ? null : entry.image_url);

    return (
      <div key={entry.id} className="border-t border-border/10 first:border-t-0">
        <button
          onClick={() => setExpandedEntry(isDetailOpen ? null : entry.id)}
          className="w-full py-3 flex justify-between items-center hover:bg-white/40 text-left px-1"
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className={`w-1.5 h-1.5 mt-1 rounded-full flex-shrink-0 ${CATEGORY_DOT_COLORS[entry.category] || "bg-muted-foreground"}`} />
            <span className="text-[10px] font-bold text-foreground uppercase whitespace-normal break-words leading-tight">
              {entry.description || "No Detail"}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span className={`text-[10px] font-black ${entry.category === "cash" ? "text-success" : "text-foreground/80"}`}>
              ₹{Number(entry.amount).toLocaleString()}
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isDetailOpen ? "rotate-180" : ""}`} />
          </div>
        </button>

        {isDetailOpen && (
          <div className="pb-3 px-1">
            {isEditing && editable && !isApproved ? (
              <div className="bg-card p-3 rounded-xl border border-primary/20 space-y-3 shadow-inner">

                {/* Image + Description + Amount */}
                <div className="flex gap-3">
                  <div className="relative flex-shrink-0">
                    <label className="relative w-16 h-16 rounded-lg bg-secondary/50 border border-dashed border-border flex flex-col items-center justify-center cursor-pointer overflow-hidden group">
                      {currentImageToShow ? (
                        <img src={currentImageToShow} className="w-full h-full object-cover" alt="Selected" />
                      ) : (
                        <>
                          <Camera className="w-4 h-4 text-muted-foreground/40" />
                          <span className="text-[7px] font-black text-muted-foreground/60 uppercase">Add</span>
                        </>
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] text-white font-black uppercase">Change</span>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={e => {
                          if (e.target.files?.[0]) {
                            handleFileSelect(entry.id, e.target.files[0]);
                            setEditValues(v => ({ ...v, removeImage: false }));
                          }
                        }}
                      />
                    </label>
                    {currentImageToShow && (
                      <button
                        type="button"
                        onClick={() => {
                          setLocalPreview(prev => ({ ...prev, [entry.id]: null }));
                          setSelectedFile(prev => ({ ...prev, [entry.id]: null }));
                          setEditValues(v => ({ ...v, removeImage: true }));
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 shadow-lg border-2 border-card"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <input
                      value={editValues.description}
                      onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                      className="w-full text-[11px] font-bold bg-secondary/50 p-2 rounded-lg border border-border outline-none focus:border-primary"
                      placeholder="Description"
                    />
                    <div className="flex items-center bg-secondary/50 p-2 rounded-lg border border-border">
                      <span className="text-[10px] font-black text-muted-foreground mr-1">₹</span>
                      <input
                        type="number"
                        value={editValues.amount}
                        onChange={e => setEditValues(v => ({ ...v, amount: e.target.value }))}
                        className="w-full bg-transparent text-[11px] font-black outline-none"
                        placeholder="Amount"
                      />
                    </div>
                  </div>
                </div>

                {/* Date + Category */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black text-muted-foreground uppercase tracking-wider mb-1 block">Date</label>
                    <input
                      type="date"
                      value={editValues.date}
                      onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
                      className="w-full text-[10px] font-bold bg-secondary/50 p-2 rounded-lg border border-border outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
                    <select
                      value={editValues.category}
                      onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))}
                      className="w-full text-[10px] font-bold bg-secondary/50 p-2 rounded-lg border border-border outline-none focus:border-primary capitalize"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat} className="capitalize">{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Number of People */}
                <div>
                  <label className="text-[8px] font-black text-muted-foreground uppercase tracking-wider mb-1 block">Number of People</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditValues(v => ({ ...v, number_of_people: String(Math.max(1, parseInt(v.number_of_people) - 1)) }))}
                      className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-sm font-black active:scale-95"
                    >−</button>
                    <span className="flex-1 text-center text-[11px] font-black bg-secondary/50 py-1.5 rounded-lg border border-border">
                      {editValues.number_of_people}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditValues(v => ({ ...v, number_of_people: String(parseInt(v.number_of_people) + 1) }))}
                      className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-sm font-black active:scale-95"
                    >+</button>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => saveEdit(entry.id)}
                    disabled={savingId === entry.id}
                    className="flex-1 bg-primary text-white py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    {savingId === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditingRow(null);
                      setLocalPreview(prev => ({ ...prev, [entry.id]: null }));
                      setSelectedFile(prev => ({ ...prev, [entry.id]: null }));
                    }}
                    className="px-4 bg-secondary text-muted-foreground rounded-lg text-[10px] font-black uppercase"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white p-2.5 rounded-xl border border-border/50 flex gap-3 shadow-sm">
                <div className="relative flex-shrink-0">
                  {entry.image_url ? (
                    <div className="relative w-14 h-14">
                      <img src={entry.image_url} className="w-full h-full rounded-lg object-cover border" alt="receipt" />
                      <button
                        onClick={() => setPreviewImage(entry.image_url)}
                        className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-lg opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <Eye className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-secondary/50 flex flex-col items-center justify-center border border-dashed border-border/60">
                      <Camera className="w-4 h-4 text-muted-foreground/30" />
                      <span className="text-[6px] font-bold text-muted-foreground/40 mt-1">NO IMAGE</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div className="flex justify-between items-start">
                    <span className={`text-[7px] px-2 py-0.5 rounded-full font-black uppercase ${STATUS_BADGES[entry.status]}`}>
                      {entry.status}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-black text-muted-foreground uppercase">{entry.category}</span>
                      {isApproved && <LockKeyhole className="w-2.5 h-2.5 text-success/60" />}
                      {entry.image_url && (
                        <button onClick={() => setPreviewImage(entry.image_url)} className="p-1 bg-primary/10 rounded-md">
                          <Eye className="w-3 h-3 text-primary" />
                        </button>
                      )}
                    </div>
                  </div>

                  {entry.rejected_reason && (
                    <p className="text-[8px] text-destructive font-bold italic mt-1 leading-tight">⚠ {entry.rejected_reason}</p>
                  )}

                  {entry.admin_note && (
                    <div className="flex items-start gap-1 mt-1 bg-primary/5 px-1.5 py-1 rounded-md">
                      <MessageSquareText className="w-2.5 h-2.5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-[8px] text-primary font-bold italic leading-tight">{entry.admin_note}</p>
                    </div>
                  )}

                  {entry.number_of_people > 1 && (
                    <p className="text-[8px] text-amber-600 font-bold mt-0.5">
                      👥 {entry.number_of_people} people
                    </p>
                  )}

                  <div className="flex justify-between items-end mt-2">
                    <p className="text-[9px] text-muted-foreground font-medium italic">
                      {isApproved ? "Verification Complete" : "Pending Review"}
                    </p>
                    {editable && !isApproved && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteExpense(entry.id)}
                          disabled={deletingId === entry.id}
                          className="text-[9px] font-black text-destructive underline active:opacity-50 flex items-center gap-0.5"
                        >
                          {deletingId === entry.id
                            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            : <Trash2 className="w-2.5 h-2.5" />}
                          Delete
                        </button>
                        <button
                          onClick={() => startEdit(entry)}
                          className="text-[9px] font-black text-primary underline active:opacity-50"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };


  // ── MISSION REPORT GENERATOR ──
  const generateMissionReport = (mission: Mission) => {
    const mExp = getExpensesForMission(mission.id);
    const mSet = settlements.filter((s: any) => s.mission_id === mission.id);

    const approvedList = mExp.filter(e => e.status === "approved" && e.category !== "cash");
    const rejectedList = mExp.filter(e => e.status === "rejected");
    const pendingList  = mExp.filter(e => e.status === "pending");

    const totalApproved  = approvedList.reduce((s, e) => s + Number(e.amount), 0);
    const totalRejected  = rejectedList.reduce((s, e) => s + Number(e.amount), 0);
    const totalPending   = pendingList.reduce((s, e) => s + Number(e.amount), 0);
    const totalReceived  = mSet.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const netPending     = totalApproved - totalReceived;

    const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const catColors: Record<string, string> = {
      travel: "#3B82F6", meal: "#F97316", hotel: "#8B5CF6",
      luggage: "#06B6D4", cash: "#6B7280", other: "#64748B",
    };

    const buildRows = (list: Expense[]) => list.map(e => {
      const col = catColors[e.category] || "#6b7280";
      const amtStyle = e.status === "rejected"
        ? "color:#ef4444;text-decoration:line-through;"
        : e.status === "pending" ? "color:#d97706;" : "color:#059669;font-weight:700;";
      const badge = e.status === "approved"
        ? `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;">APPROVED</span>`
        : e.status === "rejected"
          ? `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;">REJECTED</span>`
          : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;">PENDING</span>`;
      const imgHtml = e.image_url
        ? `<img src="${e.image_url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1.5px solid #e5e7eb;"/>`
        : `<div style="width:40px;height:40px;border-radius:8px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:8px;font-weight:700;">NO IMG</div>`;
      return `<tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 8px;font-size:10px;color:#6b7280;white-space:nowrap;">${e.date}</td>
        <td style="padding:7px 8px;"><span style="background:${col}18;color:${col};padding:2px 7px;border-radius:20px;font-size:9px;font-weight:800;text-transform:uppercase;">${e.category}</span></td>
        <td style="padding:7px 8px;font-size:10px;max-width:160px;word-break:break-word;">${e.description || "-"}</td>
        <td style="padding:7px 8px;text-align:right;font-size:11px;white-space:nowrap;${amtStyle}">${fmt(Number(e.amount))}</td>
        <td style="padding:7px 8px;text-align:center;">${badge}</td>
        <td style="padding:6px 8px;text-align:center;vertical-align:middle;">${imgHtml}</td>
      </tr>`;
    }).join("");

    const tableHead = `<thead><tr style="border-bottom:2px solid #f1f5f9;">
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Date</th>
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Category</th>
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Description</th>
      <th style="padding:6px 8px;text-align:right;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Amount</th>
      <th style="padding:6px 8px;text-align:center;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Status</th>
      <th style="padding:6px 8px;text-align:center;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Receipt</th>
    </tr></thead>`;

    const approvedSec = approvedList.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0 6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
          <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#059669;letter-spacing:0.08em;">Approved Expenses</span>
          <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${approvedList.length} records &nbsp;·&nbsp; ${fmt(totalApproved)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${tableHead}<tbody>
          ${buildRows(approvedList)}
          <tr style="border-top:2px solid #e2e8f0;">
            <td colspan="3" style="padding:8px;text-align:right;font-size:8px;font-weight:800;color:#6b7280;text-transform:uppercase;">Approved Total</td>
            <td style="padding:8px;text-align:right;font-size:12px;font-weight:900;color:#059669;">${fmt(totalApproved)}</td>
            <td colspan="2"></td>
          </tr>
          </tbody>
        </table>
      </div>` : "";

    const rejectedSec = rejectedList.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0 6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;"></div>
          <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#dc2626;letter-spacing:0.08em;">Rejected Expenses</span>
          <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${rejectedList.length} records &nbsp;·&nbsp; ${fmt(totalRejected)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${tableHead}<tbody>${buildRows(rejectedList)}</tbody>
        </table>
      </div>` : "";

    const pendingSec = pendingList.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0 6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></div>
          <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#d97706;letter-spacing:0.08em;">Pending Expenses</span>
          <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${pendingList.length} records &nbsp;·&nbsp; ${fmt(totalPending)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${tableHead}<tbody>${buildRows(pendingList)}</tbody>
        </table>
      </div>` : "";

    const buildSettlementRows = (list: any[]) => list.map((s: any) => {
      const imgHtml = s.proof_url
        ? `<img src="${s.proof_url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1.5px solid #e5e7eb;"/>`
        : `<div style="width:40px;height:40px;border-radius:8px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:8px;">NO IMG</div>`;
      return `<tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 8px;font-size:10px;color:#6b7280;">${s.created_at?.split("T")[0] || "-"}</td>
        <td style="padding:7px 8px;font-size:10px;">${s.note || s.mission?.name || "-"}</td>
        <td style="padding:7px 8px;text-align:right;font-size:11px;font-weight:800;color:#059669;">${fmt(Number(s.amount))}</td>
        <td style="padding:6px 8px;text-align:center;vertical-align:middle;">${imgHtml}</td>
      </tr>`;
    }).join("");

    const settlementSec = mSet.length > 0 ? `
      <div style="margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0 6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#2563eb;flex-shrink:0;"></div>
          <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#2563eb;letter-spacing:0.08em;">Amount Received</span>
          <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${mSet.length} payment${mSet.length > 1 ? "s" : ""} &nbsp;·&nbsp; ${fmt(totalReceived)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:2px solid #f1f5f9;">
            <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Date</th>
            <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Note</th>
            <th style="padding:6px 8px;text-align:right;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Amount</th>
            <th style="padding:6px 8px;text-align:center;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Proof</th>
          </tr></thead>
          <tbody>
            ${buildSettlementRows(mSet)}
            <tr style="border-top:2px solid #e2e8f0;">
              <td colspan="2" style="padding:8px;text-align:right;font-size:8px;font-weight:800;color:#6b7280;text-transform:uppercase;">Total Received</td>
              <td style="padding:8px;text-align:right;font-size:12px;font-weight:900;color:#2563eb;">${fmt(totalReceived)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>` : "";

    const pendingColor = netPending > 0 ? "#dc2626" : "#059669";
    const startDate = new Date(mission.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const endDate = mission.end_date
      ? new Date(mission.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "Ongoing";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Mission Report — ${mission.name}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; }
.page { max-width:960px; margin:0 auto; background:#fff; }
@media print {
  @page { size:A4 portrait; margin:8mm; }
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; background:#fff; }
  .no-print { display:none !important; }
  .page { max-width:100%; }
}
</style></head><body>
<div class="page">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#0f2444);color:#fff;padding:28px 36px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px;">Expense<span style="color:#34d399;">.</span>Report</div>
        <div style="font-size:14px;font-weight:800;color:#e2e8f0;margin-top:8px;text-transform:uppercase;letter-spacing:0.05em;">${mission.name}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:6px;line-height:1.8;">
          <div>Employee: <span style="color:#e2e8f0;font-weight:700;">${userName}</span></div>
          <div>Period: <span style="color:#e2e8f0;">${startDate} → ${endDate}</span></div>
          <div>Generated: ${today}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Net Pending</div>
        <div style="font-size:28px;font-weight:900;color:${pendingColor};">${fmt(Math.abs(netPending))}</div>
        <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${netPending > 0 ? "amount to be paid" : "advance / settled"}</div>
      </div>
    </div>
  </div>

  <!-- Summary pills -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px 36px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
    <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #e2e8f0;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:4px;">Total Approved</div>
      <div style="font-size:18px;font-weight:900;color:#059669;">${fmt(totalApproved)}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #e2e8f0;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:4px;">Total Received</div>
      <div style="font-size:18px;font-weight:900;color:#2563eb;">${fmt(totalReceived)}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #e2e8f0;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:4px;">Net Pending</div>
      <div style="font-size:18px;font-weight:900;color:${pendingColor};">${fmt(Math.abs(netPending))}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #e2e8f0;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:4px;">Total Rejected</div>
      <div style="font-size:18px;font-weight:900;color:#dc2626;">${fmt(totalRejected)}</div>
    </div>
  </div>

  <!-- Pending row (extra context) -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px 36px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
    <div style="background:#fff;border-radius:12px;padding:12px;border:1px solid #fef3c7;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#d97706;margin-bottom:4px;">Pending (Awaiting Review)</div>
      <div style="font-size:16px;font-weight:900;color:#d97706;">${fmt(totalPending)}</div>
      <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${pendingList.length} entries</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:12px;border:1px solid #d1fae5;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#059669;margin-bottom:4px;">Approved Entries</div>
      <div style="font-size:16px;font-weight:900;color:#059669;">${approvedList.length}</div>
      <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${fmt(totalApproved)}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:12px;border:1px solid #fee2e2;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#dc2626;margin-bottom:4px;">Rejected Entries</div>
      <div style="font-size:16px;font-weight:900;color:#dc2626;">${rejectedList.length}</div>
      <div style="font-size:8px;color:#94a3b8;margin-top:2px;">${fmt(totalRejected)}</div>
    </div>
  </div>

  <!-- Expense sections -->
  <div style="padding:24px 36px;">
    ${approvedSec}
    ${pendingSec}
    ${rejectedSec}
    ${settlementSec}
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;border-top:2px solid #e2e8f0;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#6b7280;">
      <div style="font-weight:800;color:#374151;font-size:11px;margin-bottom:3px;">${mission.name} — Final Summary</div>
      <div>Approved: ${fmt(totalApproved)} &nbsp;|&nbsp; Received: ${fmt(totalReceived)} &nbsp;|&nbsp; Rejected: ${fmt(totalRejected)} &nbsp;|&nbsp; Pending review: ${fmt(totalPending)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:8px;color:#94a3b8;margin-bottom:2px;font-weight:700;text-transform:uppercase;">Net Payable</div>
      <div style="font-size:18px;font-weight:900;color:${pendingColor};">${fmt(Math.max(0, netPending))}</div>
    </div>
  </div>
</div>

<div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;z-index:999;">
  <button onclick="window.print()" style="background:linear-gradient(135deg,#1e3a5f,#0f2444);color:#fff;border:none;padding:12px 28px;border-radius:12px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);">🖨️ PRINT</button>
  <button onclick="window.close()" style="background:#fff;color:#6b7280;border:1px solid #e2e8f0;padding:12px 20px;border-radius:12px;font-size:12px;cursor:pointer;">CLOSE</button>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 600);</script>
</body></html>`;

    const w = window.open("", "_blank", "width=980,height=860");
    if (!w) { toast.error("Popup blocked! Allow popups and try again."); return; }
    w.document.write(html);
    w.document.close();
  };

  const renderActiveMission = (mission: Mission) => {
    const missionExpenses = getExpensesForMission(mission.id);
    const dateGroups = groupByDate(missionExpenses);
    const missionTotal = missionExpenses.filter(e => e.category !== "cash").reduce((s, e) => s + Number(e.amount), 0);
    const cashTotal = missionExpenses.filter(e => e.category === "cash").reduce((s, e) => s + Number(e.amount), 0);
    const isMissionOpen = expandedMissions.has(mission.id);
    const sd = getMissionSettlementStatus(mission.id);

    return (
      <div key={mission.id} className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in mb-3">
        <button
          onClick={() => toggleMission(mission.id)}
          className="w-full p-4 bg-primary/5 border-b border-border text-left hover:bg-primary/10 transition-colors"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
                <h4 className="text-xs font-black text-foreground uppercase tracking-tight truncate">{mission.name}</h4>
              </div>
              {(mission as any).address && (
                <p className="text-[8px] text-muted-foreground/60 font-bold flex items-center gap-0.5 ml-3.5">
                  <MapPin className="w-2.5 h-2.5" /> {(mission as any).address}
                </p>
              )}
              {(mission as any).mission_with && (
                <p className="text-[8px] text-muted-foreground/60 font-bold flex items-center gap-0.5 ml-3.5">
                  <UsersIcon className="w-2.5 h-2.5" /> {(mission as any).mission_with}
                </p>
              )}
              <p className="text-[8px] text-muted-foreground font-bold mt-0.5 ml-3.5">
                {new Date(mission.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} → Ongoing
              </p>
              <div className="flex gap-1.5 mt-1.5 ml-3.5 flex-wrap">
                <span className="text-[7px] bg-secondary px-2 py-0.5 rounded-full font-black text-muted-foreground">{missionExpenses.length} entries</span>
                <span className="text-[7px] px-2 py-0.5 rounded-full font-black uppercase bg-success/15 text-success">Active</span>
                {sd.hasExpenses && (
                  sd.isSettled ? (
                    <span className="flex items-center gap-0.5 text-[7px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <BadgeCheck className="w-2.5 h-2.5" /> Settled
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[7px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-100">
                      <CircleDollarSign className="w-2.5 h-2.5" /> ₹{sd.pending.toLocaleString()} Due
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 flex-shrink-0 ml-2">
              <div className="text-right">
                <p className="text-xs font-black text-destructive">₹{missionTotal.toLocaleString()}</p>
                {cashTotal > 0 && <p className="text-[8px] font-bold text-success">+₹{cashTotal.toLocaleString()}</p>}
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 mt-0.5 ${isMissionOpen ? "rotate-180" : ""}`} />
            </div>
          </div>
        </button>

        {isMissionOpen && (
          <div>
            {(mission as any).details && (
              <div className="px-4 pt-3 pb-1">
                <div className="flex items-start gap-2 bg-secondary/30 p-2.5 rounded-xl border border-border/50">
                  <FileText className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                  <p className="text-[8px] text-muted-foreground font-medium leading-relaxed">{(mission as any).details}</p>
                </div>
              </div>
            )}
            <div className="px-4 pt-2">
              <MissionGallery missionId={mission.id} userId={userId} isActive={true} />
            </div>
            {/* Create Report Button */}
            <div className="px-4 pt-2 pb-1">
              <button
                onClick={() => generateMissionReport(mission)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 text-white shadow-sm"
                style={{background: "linear-gradient(135deg,#1e3a5f,#0f2444)"}}
              >
                <FileBarChart2 className="w-3.5 h-3.5" />
                Create Report
              </button>
            </div>
            <div className="divide-y divide-border">
              {dateGroups.length === 0 && (
                <p className="text-center text-muted-foreground text-[10px] italic py-6">No entries yet</p>
              )}
              {dateGroups.map(([date, entries]) => {
                const dateKey = `${mission.id}_${date}`;
                const isOpen = expandedDates.has(dateKey);
                const dayTotal = entries.filter(e => e.category !== "cash").reduce((s, e) => s + Number(e.amount), 0);
                return (
                  <div key={dateKey}>
                    <button onClick={() => toggleDate(dateKey)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-[9px] font-black text-primary uppercase tracking-tighter">
                          {new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                        </span>
                        <span className="text-[8px] bg-secondary px-1.5 py-0.5 rounded-full font-bold text-muted-foreground">{entries.length}</span>
                      </div>
                      <span className="text-[10px] font-black text-foreground">₹{dayTotal.toLocaleString()}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2">
                        {entries.map(entry => renderExpenseEntry(entry, true))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOldMission = (mission: Mission) => {
    const missionExpenses = getExpensesForMission(mission.id);
    const dateGroups = groupByDate(missionExpenses);
    const missionTotal = missionExpenses.filter(e => e.category !== "cash").reduce((s, e) => s + Number(e.amount), 0);
    const cashTotal = missionExpenses.filter(e => e.category === "cash").reduce((s, e) => s + Number(e.amount), 0);
    const isMissionOpen = expandedMissions.has(mission.id);
    const sd = getMissionSettlementStatus(mission.id);

    return (
      <div key={mission.id} className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in mb-3">
        <button
          onClick={() => toggleMission(mission.id)}
          className="w-full p-4 bg-muted/30 border-b border-border text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {isMissionOpen ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <div>
                <h4 className="text-xs font-black text-foreground uppercase tracking-tight">{mission.name}</h4>
                {(mission as any).address && (
                  <p className="text-[8px] text-muted-foreground/60 font-bold flex items-center gap-0.5 mt-0.5">
                    <MapPin className="w-2.5 h-2.5" /> {(mission as any).address}
                  </p>
                )}
                {(mission as any).mission_with && (
                  <p className="text-[8px] text-muted-foreground/60 font-bold flex items-center gap-0.5">
                    <UsersIcon className="w-2.5 h-2.5" /> {(mission as any).mission_with}
                  </p>
                )}
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">
                  {new Date(mission.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}{mission.end_date ? ` → ${new Date(mission.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}` : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-destructive">₹{missionTotal.toLocaleString()}</p>
              {cashTotal > 0 && <p className="text-[9px] font-bold text-success">+₹{cashTotal.toLocaleString()}</p>}
              <span className="text-[8px] bg-secondary px-2 py-0.5 rounded-full font-black text-muted-foreground">{missionExpenses.length} entries</span>
              {sd.hasExpenses && (
                <div className="mt-1.5 flex justify-end">
                  {sd.isSettled ? (
                    <span className="flex items-center gap-0.5 text-[7px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <BadgeCheck className="w-2.5 h-2.5" /> Settled
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[7px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-100">
                      <CircleDollarSign className="w-2.5 h-2.5" /> ₹{sd.pending.toLocaleString()} Due
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </button>

        {isMissionOpen && (
          <div>
            {(mission as any).details && (
              <div className="px-4 pt-3 pb-1">
                <div className="flex items-start gap-2 bg-secondary/30 p-2.5 rounded-xl border border-border/50">
                  <FileText className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                  <p className="text-[8px] text-muted-foreground font-medium leading-relaxed">{(mission as any).details}</p>
                </div>
              </div>
            )}
            <div className="px-4 pb-2">
              <MissionGallery missionId={mission.id} userId={userId} isActive={false} />
            </div>
            {/* Create Report Button */}
            <div className="px-4 pb-2">
              <button
                onClick={() => generateMissionReport(mission)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 text-white shadow-sm"
                style={{background: "linear-gradient(135deg,#1e3a5f,#0f2444)"}}
              >
                <FileBarChart2 className="w-3.5 h-3.5" />
                Create Report
              </button>
            </div>
            <div className="divide-y divide-border">
              {dateGroups.length === 0 && (
                <p className="text-center text-muted-foreground text-[10px] italic py-6">No entries in this mission</p>
              )}
              {dateGroups.map(([date, entries]) => {
                const dateKey = `old_${mission.id}_${date}`;
                const isDateOpen = expandedDates.has(dateKey);
                const dayTotal = entries.filter(e => e.category !== "cash").reduce((s, e) => s + Number(e.amount), 0);
                const dayCash = entries.filter(e => e.category === "cash").reduce((s, e) => s + Number(e.amount), 0);
                return (
                  <div key={dateKey}>
                    <button onClick={() => toggleDate(dateKey)} className="w-full px-5 py-3 flex justify-between items-center hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-2">
                        {isDateOpen ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-[9px] font-black text-primary uppercase tracking-tighter">
                          {new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                        <span className="text-[8px] bg-secondary px-1.5 py-0.5 rounded-full font-bold text-muted-foreground">{entries.length} entries</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-foreground">₹{dayTotal.toLocaleString()}</span>
                        {dayCash > 0 && <span className="text-[9px] font-bold text-success">+₹{dayCash.toLocaleString()}</span>}
                      </div>
                    </button>
                    {isDateOpen && (
                      <div className="px-4 pb-3 space-y-2">
                        {entries.map(entry => renderExpenseEntry(entry, false))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState<"active" | "old">("active");

  if (missions.length === 0) {
    return (
      <div className="mt-8 text-center py-10">
        <p className="text-muted-foreground text-xs italic">No missions found. Start a mission to begin logging expenses.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-3 px-1">
        <h3 className="font-black text-foreground uppercase text-[10px] tracking-widest">Journey Logbook</h3>
        <span className="text-[9px] bg-secondary px-2 py-0.5 rounded-full font-bold text-muted-foreground">
          {expenses.length} Logs
        </span>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${
            activeTab === "active" ? "bg-primary text-primary-foreground shadow-lg" : "bg-secondary/60 text-muted-foreground"
          }`}
        >
          Active ({activeMissions.length})
        </button>
        <button
          onClick={() => setActiveTab("old")}
          className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${
            activeTab === "old" ? "bg-foreground text-background shadow-lg" : "bg-secondary/60 text-muted-foreground"
          }`}
        >
          Old Missions ({oldMissions.length})
        </button>
      </div>

      {activeTab === "active" && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {activeMissions.length === 0 ? (
            <div className="text-center py-10 bg-secondary/20 rounded-3xl border-2 border-dashed border-secondary">
              <p className="text-muted-foreground text-[10px] italic font-bold uppercase tracking-widest">No active missions</p>
            </div>
          ) : (
            activeMissions.map(m => renderActiveMission(m))
          )}
        </div>
      )}

      {activeTab === "old" && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {oldMissions.length === 0 ? (
            <div className="text-center py-10 bg-secondary/20 rounded-3xl border-2 border-dashed border-secondary">
              <p className="text-muted-foreground text-[10px] italic font-bold uppercase tracking-widest">No completed missions</p>
            </div>
          ) : (
            oldMissions.map(m => renderOldMission(m))
          )}
        </div>
      )}

      <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
