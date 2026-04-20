import { useState, useEffect, lazy, Suspense, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  LogOut, Settings, History, X, Image as ImageIcon, Maximize2,
  Bell, Plus, CheckCircle, Loader2, ChevronDown, ChevronUp,
  MapPin, Users, FileText, Camera, SlidersHorizontal,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ImagePreviewModal from "@/components/expense/ImagePreviewModal";
import ExpenseForm from "@/components/expense/ExpenseForm";

const JourneyLogbook = lazy(() => import("@/components/expense/JourneyLogbook"));

const emptyForm = { name: "", address: "", mission_with: "", details: "" };

export default function UserDashboard() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { user, profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  // Core data
  const [allActiveMissions, setAllActiveMissions] = useState<any[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>("");
  const [expenses, setExpenses] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // UI toggles
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Finish mission
  const [finishingId, setFinishingId] = useState<string | null>(null);

  // ── CREATE MISSION MODAL ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createSaving, setCreateSaving] = useState(false);
  const [createPhotos, setCreatePhotos] = useState<File[]>([]);
  const [createPhotoUrls, setCreatePhotoUrls] = useState<string[]>([]);
  const createFileRef = useRef<HTMLInputElement>(null);

  // ── MISSION SETTINGS MODAL ──
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      try {
        const [missionRes, expenseRes, settlementRes, limitsRes, notifRes] = await Promise.all([
          supabase.from("missions").select("*").eq("user_id", user.id)
            .in("status", ["active", "pending"]).order("created_at", { ascending: false }),
          supabase.from("expenses").select("*").eq("user_id", user.id)
            .order("date", { ascending: false }).order("created_at", { ascending: false }),
          supabase.from("settlements" as any)
            .select(`*, admin:profiles!settlements_settled_by_fkey (name), mission:missions(name)`)
            .eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("category_limits").select("category, daily_limit"),
          supabase.from("notifications" as any)
            .select("id", { count: "exact" }).eq("user_id", user.id).eq("is_read", false),
        ]);

        const actives = missionRes.data || [];
        setAllActiveMissions(actives);
        setSelectedMissionId(prev => {
          if (prev && actives.find((m: any) => m.id === prev)) return prev;
          return actives[0]?.id || "";
        });
        setExpenses(expenseRes.data || []);
        setSettlements((settlementRes as any).data || []);
        const limits: Record<string, number> = {};
        limitsRes.data?.forEach(l => { limits[l.category] = Number(l.daily_limit); });
        setCategoryLimits(limits);
        setUnreadCount((notifRes as any).count || 0);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      }
    };
    fetchAll();
  }, [user, refreshKey]);

  // Calculations
  const todayStr = new Date().toISOString().split("T")[0];
  const todayExpenses = expenses.filter(e => e.date === todayStr);
  const totalApprovedExpense = expenses
    .filter(e => e.status === "approved" && e.category !== "cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalReceived = settlements.reduce((s, e) => s + Number(e.amount), 0);
  const todayTotal = todayExpenses.filter(e => e.category !== "cash").reduce((s, e) => s + Number(e.amount), 0);
  const todayReceived = settlements
    .filter(s => s.created_at?.startsWith(todayStr))
    .reduce((s, e) => s + Number(e.amount), 0);
  const pendingAmount = totalApprovedExpense - totalReceived;
  const balance = totalReceived - totalApprovedExpense;
  const selectedMission = allActiveMissions.find(m => m.id === selectedMissionId);

  // ── FINISH MISSION ──
  const handleFinishMission = async () => {
    if (!selectedMissionId) return;
    setFinishingId(selectedMissionId);
    try {
      const { error } = await supabase.from("missions").update({
        status: "completed",
        end_date: new Date().toISOString().split("T")[0],
      }).eq("id", selectedMissionId);
      if (error) throw error;
      toast.success("Mission completed!");
      setSelectedMissionId("");
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
    setFinishingId(null);
  };

  // ── CREATE MISSION ──
  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowed = 4 - createPhotos.length;
    const newPhotos = [...createPhotos, ...files.slice(0, allowed)];
    setCreatePhotos(newPhotos);
    setCreatePhotoUrls(prev => [...prev, ...files.slice(0, allowed).map(f => URL.createObjectURL(f))]);
    if (createFileRef.current) createFileRef.current.value = "";
  };

  const uploadMissionPhotos = async (missionId: string, photos: File[]) => {
    for (const file of photos) {
      const ext = file.name.split(".").pop();
      const path = `${user!.id}/${missionId}/${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;
      const { error } = await supabase.storage.from("mission-photos").upload(path, file);
      if (error) continue;
      const { data: urlData } = supabase.storage.from("mission-photos").getPublicUrl(path);
      await supabase.from("mission_photos" as any).insert({
        mission_id: missionId, user_id: user!.id, image_url: urlData.publicUrl,
      });
    }
  };

  const handleCreateMission = async () => {
    if (!createForm.name.trim()) return toast.error("Mission name required!");
    if (!createForm.address.trim()) return toast.error("Address required!");
    if (!createForm.mission_with.trim()) return toast.error("Mission With required!");
    if (!createForm.details.trim()) return toast.error("Details required!");
    setCreateSaving(true);
    try {
      const { data, error } = await supabase.from("missions").insert({
        user_id: user!.id,
        name: createForm.name.trim(),
        address: createForm.address.trim(),
        mission_with: createForm.mission_with.trim(),
        details: createForm.details.trim(),
        status: "active",
      }).select().single();
      if (error) throw error;
      if (createPhotos.length > 0) await uploadMissionPhotos(data.id, createPhotos);
      toast.success("Mission started!");
      setCreateForm(emptyForm);
      setCreatePhotos([]);
      setCreatePhotoUrls([]);
      setShowCreateModal(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreateSaving(false);
  };

  // ── EDIT MISSION SETTINGS ──
  const openSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedMission) return;
    setEditForm({
      name: selectedMission.name || "",
      address: selectedMission.address || "",
      mission_with: selectedMission.mission_with || "",
      details: selectedMission.details || "",
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!editForm.name.trim()) return toast.error("Name required!");
    setEditSaving(true);
    try {
      const { error } = await supabase.from("missions").update({
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        mission_with: editForm.mission_with.trim(),
        details: editForm.details.trim(),
      }).eq("id", selectedMissionId);
      if (error) throw error;
      toast.success("Mission updated!");
      setShowSettingsModal(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
    setEditSaving(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">

      {/* ══════════════════════════════════════════
          COMPACT HEADER
      ══════════════════════════════════════════ */}
      <div className="flex-shrink-0 bg-primary shadow-lg">

        {/* Top bar: Logo + User + Actions */}
        <div className="flex justify-between items-center px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
            <div>
              <h1 className="text-sm font-black italic tracking-tighter text-primary-foreground uppercase leading-none">
                Expense
              </h1>
              <p className="text-[8px] font-bold text-primary-foreground/60 uppercase tracking-wider">
                {profile?.name || "User"}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 items-center">
            <button
              onClick={() => navigate("/notifications")}
              className="relative bg-primary-foreground/10 p-1.5 rounded-lg text-primary-foreground border border-white/10 active:scale-90 transition-all"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive text-white text-[7px] font-black rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {role === "admin" && (
              <button onClick={() => navigate("/admin")} className="bg-primary-foreground/10 p-1.5 rounded-lg text-primary-foreground border border-white/10 active:scale-90 transition-all">
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={signOut} className="bg-primary-foreground/10 p-1.5 rounded-lg text-primary-foreground border border-white/10 active:scale-90 transition-all">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── MISSION TAGS ROW ── */}
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">

            {/* Mission tags */}
            {allActiveMissions.map((m: any) => {
              const isSelected = selectedMissionId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMissionId(m.id)}
                  className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-[8px] font-black uppercase transition-all active:scale-95 border ${
                    isSelected
                      ? "bg-primary-foreground text-primary border-transparent shadow-md"
                      : "bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full flex-shrink-0 ${
                    isSelected ? "bg-primary" : "bg-green-400 animate-pulse"
                  }`} />
                  <span className="leading-none">{m.name}</span>

                  {/* Settings icon — only on selected tag */}
                  {isSelected && (
                    <span
                      onClick={openSettings}
                      className="ml-0.5 w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center active:scale-75 transition-all cursor-pointer"
                    >
                      <SlidersHorizontal className="w-2 h-2 text-primary" />
                    </span>
                  )}
                </button>
              );
            })}

            {/* Create New Mission button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase bg-primary-foreground/10 text-primary-foreground border border-dashed border-primary-foreground/30 active:scale-95 transition-all hover:bg-primary-foreground/20"
            >
              <Plus className="w-2.5 h-2.5" />
              New Mission
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          COMPACT STATS BAR
      ══════════════════════════════════════════ */}
      <div className="flex-shrink-0 bg-card border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <div>
              <p className="text-[6px] font-black uppercase text-muted-foreground tracking-widest">Received</p>
              <p className="text-sm font-black text-emerald-500 leading-none">₹{totalReceived.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[6px] font-black uppercase text-muted-foreground tracking-widest">Expense</p>
              <p className="text-sm font-black text-destructive leading-none">₹{totalApprovedExpense.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[6px] font-black uppercase text-muted-foreground tracking-widest">Balance</p>
              <p className={`text-sm font-black leading-none ${balance >= 0 ? "text-foreground" : "text-destructive"}`}>
                ₹{Math.abs(balance).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className={`text-[8px] font-black italic ${pendingAmount > 0 ? "text-destructive" : "text-emerald-500"}`}>
                {pendingAmount > 0
                  ? `₹${pendingAmount.toLocaleString()} Due`
                  : `₹${Math.abs(pendingAmount).toLocaleString()} Adv`}
              </p>
              <div className="flex gap-1 mt-0.5 justify-end">
                <button
                  onClick={() => setShowSettlementModal(true)}
                  className="flex items-center gap-0.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded-md active:scale-95 transition-all"
                >
                  <History className="w-2.5 h-2.5" />
                  <span className="text-[7px] font-black uppercase">Ledger</span>
                </button>
                <button onClick={() => setShowStats(!showStats)} className="bg-muted p-0.5 rounded-md active:scale-95 transition-all">
                  {showStats
                    ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                    : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
        </div>
        {showStats && (
          <div className="mt-2 pt-2 border-t border-border/50 flex gap-4 animate-in slide-in-from-top-1 duration-150">
            <div>
              <p className="text-[6px] font-black uppercase text-muted-foreground tracking-widest">Today Expense</p>
              <p className="text-xs font-black text-foreground">₹{todayTotal.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[6px] font-black uppercase text-muted-foreground tracking-widest">Today Received</p>
              <p className="text-xs font-black text-emerald-500">₹{todayReceived.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          SCROLLABLE CONTENT
      ══════════════════════════════════════════ */}
      <div className="flex-grow overflow-y-auto scrollbar-hide px-4 pt-3 pb-24">

        {allActiveMissions.length === 0 ? (
          <div className="bg-muted/30 border-2 border-dashed border-muted rounded-3xl p-8 text-center mb-4">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-3">
              No Active Mission
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 mx-auto px-4 py-2 bg-primary text-primary-foreground rounded-xl text-[9px] font-black uppercase active:scale-95 transition-all"
            >
              <Plus className="w-3 h-3" /> Create New Mission
            </button>
          </div>
        ) : (
          <>
            {/* ── Finish Mission Bar ── */}
            {selectedMission && (
              <div className="mb-3 flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[7px] font-black text-muted-foreground uppercase tracking-widest">Logging for</p>
                  <p className="text-[10px] font-black text-primary">{selectedMission.name}</p>
                </div>
                <button
                  onClick={handleFinishMission}
                  disabled={finishingId === selectedMissionId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-xl text-[8px] font-black uppercase active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
                >
                  {finishingId === selectedMissionId
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <><CheckCircle className="w-3 h-3" /> Finish Mission</>}
                </button>
              </div>
            )}

            {selectedMissionId && (
              <ExpenseForm
                key={selectedMissionId}
                userId={user?.id || ""}
                missionId={selectedMissionId}
                categoryLimits={categoryLimits}
                todayExpenses={todayExpenses}
                onSaved={refresh}
                isAdmin={role === "admin"}
              />
            )}
          </>
        )}

        <Suspense fallback={
          <div className="bg-muted/30 border border-border rounded-2xl p-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-4">
            Loading journal...
          </div>
        }>
          <JourneyLogbook userId={user?.id || ""} refreshKey={refreshKey} />
        </Suspense>
      </div>

      {/* ══════════════════════════════════════════
          CREATE MISSION — CENTERED POPUP
      ══════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="bg-card w-full max-w-[380px] rounded-[1.75rem] border border-border shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-border flex justify-between items-center">
              <div>
                <h3 className="font-black italic text-base tracking-tighter uppercase leading-none text-foreground">
                  Create Mission
                </h3>
                <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                  New mission details
                </p>
              </div>
              <button
                onClick={() => { setShowCreateModal(false); setCreateForm(emptyForm); setCreatePhotos([]); setCreatePhotoUrls([]); }}
                className="bg-muted p-1.5 rounded-full active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 space-y-2.5 max-h-[65vh] overflow-y-auto">
              {[
                { ph: "Mission Name *", key: "name", icon: <FileText className="w-3 h-3" /> },
                { ph: "Address *", key: "address", icon: <MapPin className="w-3 h-3" /> },
                { ph: "Mission With *", key: "mission_with", icon: <Users className="w-3 h-3" /> },
              ].map(f => (
                <div key={f.key} className="flex items-center gap-2 bg-secondary/40 rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                  <span className="text-muted-foreground flex-shrink-0">{f.icon}</span>
                  <input
                    type="text"
                    placeholder={f.ph}
                    value={(createForm as any)[f.key]}
                    onChange={e => setCreateForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="flex-1 bg-transparent text-[11px] font-bold text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              ))}

              <div className="flex items-start gap-2 bg-secondary/40 rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                <FileText className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <textarea
                  placeholder="Mission Details *"
                  value={createForm.details}
                  rows={2}
                  onChange={e => setCreateForm(prev => ({ ...prev, details: e.target.value }))}
                  className="flex-1 bg-transparent text-[11px] font-bold text-foreground outline-none resize-none placeholder:text-muted-foreground"
                />
              </div>

              {/* Photos */}
              <div className="flex gap-2 flex-wrap pt-1">
                {createPhotoUrls.map((url, i) => (
                  <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden border border-border shadow-sm">
                    <img src={url} className="w-full h-full object-cover" alt="" />
                    <button
                      onClick={() => {
                        setCreatePhotos(p => p.filter((_, j) => j !== i));
                        setCreatePhotoUrls(p => p.filter((_, j) => j !== i));
                      }}
                      className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 shadow"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {createPhotos.length < 4 && (
                  <label className="w-14 h-14 rounded-xl bg-secondary border border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <Camera className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <span className="text-[7px] font-bold text-muted-foreground/50 mt-0.5">Photo</span>
                    <input ref={createFileRef} type="file" className="hidden" accept="image/*" multiple onChange={handleCreatePhotoSelect} />
                  </label>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 pb-4">
              <button
                onClick={handleCreateMission}
                disabled={createSaving}
                className="w-full py-3 bg-primary text-primary-foreground rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-lg disabled:opacity-50"
              >
                {createSaving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                  : "Start Mission"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MISSION SETTINGS — CENTERED POPUP
      ══════════════════════════════════════════ */}
      {showSettingsModal && selectedMission && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="bg-card w-full max-w-[380px] rounded-[1.75rem] border border-border shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-border flex justify-between items-center">
              <div>
                <h3 className="font-black italic text-base tracking-tighter uppercase leading-none text-foreground">
                  Mission Settings
                </h3>
                <p className="text-[8px] font-bold text-primary uppercase tracking-widest mt-0.5 truncate max-w-[200px]">
                  {selectedMission.name}
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="bg-muted p-1.5 rounded-full active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Edit Form */}
            <div className="p-4 space-y-2.5">
              {[
                { ph: "Mission Name *", key: "name", icon: <FileText className="w-3 h-3" /> },
                { ph: "Address", key: "address", icon: <MapPin className="w-3 h-3" /> },
                { ph: "Mission With", key: "mission_with", icon: <Users className="w-3 h-3" /> },
              ].map(f => (
                <div key={f.key} className="flex items-center gap-2 bg-secondary/40 rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                  <span className="text-muted-foreground flex-shrink-0">{f.icon}</span>
                  <input
                    type="text"
                    placeholder={f.ph}
                    value={(editForm as any)[f.key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="flex-1 bg-transparent text-[11px] font-bold text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              ))}

              <div className="flex items-start gap-2 bg-secondary/40 rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                <FileText className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <textarea
                  placeholder="Details"
                  value={editForm.details}
                  rows={2}
                  onChange={e => setEditForm(prev => ({ ...prev, details: e.target.value }))}
                  className="flex-1 bg-transparent text-[11px] font-bold text-foreground outline-none resize-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 py-2.5 bg-secondary text-muted-foreground rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={editSaving}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-95 transition-all shadow-md disabled:opacity-50"
              >
                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          RECEIVING LEDGER MODAL
      ══════════════════════════════════════════ */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card w-full max-w-[420px] rounded-[2.5rem] border border-border shadow-2xl animate-in slide-in-from-bottom-10 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/10">
              <h3 className="font-black italic text-sm tracking-tighter uppercase leading-none">Receiving History</h3>
              <button onClick={() => setShowSettlementModal(false)} className="bg-muted p-1.5 rounded-full active:scale-90 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 overflow-y-auto space-y-1">
              {settlements.length > 0 ? settlements.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-muted/10 border border-border/40 hover:bg-muted/30 transition-all group">
                  {s.proof_url ? (
                    <div onClick={() => setSelectedImage(s.proof_url)} className="relative w-10 h-10 rounded-xl overflow-hidden border border-border flex-shrink-0 cursor-pointer active:scale-90 transition-transform">
                      <img src={s.proof_url} className="w-full h-full object-cover" alt="receipt" />
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 border border-dashed border-border">
                      <ImageIcon className="w-3.5 h-3.5 opacity-20" />
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="font-black italic text-sm text-foreground">₹{Number(s.amount).toLocaleString()}</p>
                      <p className="text-[7px] font-bold opacity-40 uppercase">{new Date(s.created_at).toLocaleDateString("en-GB")}</p>
                    </div>
                    <p className="text-[8px] font-black text-primary uppercase truncate mt-0.5">
                      From: {s.admin?.name || "Admin"}
                      {s.mission?.name && (
                        <span className="ml-1 text-[7px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{s.mission.name}</span>
                      )}
                    </p>
                    {s.notes && <p className="text-[7px] font-medium text-muted-foreground/70 truncate italic mt-0.5">Note: {s.notes}</p>}
                  </div>
                </div>
              )) : (
                <div className="text-center py-10 opacity-40 font-black text-[10px] uppercase italic tracking-widest">No Records Found</div>
              )}
            </div>
            <div className="p-3 border-t border-border">
              <button onClick={() => setShowSettlementModal(false)} className="w-full py-3 bg-foreground text-background rounded-2xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ImagePreviewModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </div>
  );
}
