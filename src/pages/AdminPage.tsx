import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Shield, DollarSign, Users, Wallet, Activity, Settings, BarChart3 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ExpensesTab    from "@/components/admin/tabs/ExpensesTab";
import SettlementsTab from "@/components/admin/tabs/SettlementsTab";
import UsersTab       from "@/components/admin/tabs/UsersTab";
import LimitsTab      from "@/components/admin/tabs/LimitsTab";
import ReportsTab     from "@/components/admin/tabs/ReportsTab";
import AdminJournalLogbook from "@/components/admin/AdminJournalLogbook";
import AdminFundTab   from "@/components/admin/AdminFundTab";

type Tab = "expenses" | "users" | "limits" | "reports" | "settlements" | "journal" | "fund";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "expenses",    label: "Expenses",  icon: <DollarSign className="w-4 h-4" /> },
  { key: "users",       label: "Users",     icon: <Users className="w-4 h-4" /> },
  { key: "settlements", label: "Settle",    icon: <Wallet className="w-4 h-4" /> },
  { key: "journal",     label: "Journal",   icon: <Activity className="w-4 h-4" /> },
  { key: "limits",      label: "Limits",    icon: <Settings className="w-4 h-4" /> },
  { key: "reports",     label: "Reports",   icon: <BarChart3 className="w-4 h-4" /> },
  { key: "fund",        label: "Fund",      icon: <Wallet className="w-4 h-4" /> },
];

export default function AdminPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]                 = useState<Tab>("expenses");
  const [expenses, setExpenses]       = useState<any[]>([]);
  const [users, setUsers]             = useState<any[]>([]);
  const [limits, setLimits]           = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const [searchFilters, setSearchFilters] = useState({
    searchQuery: "", userEmails: [] as string[], missionName: "all",
    category: "all", startDate: "", endDate: "", status: "all",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [expRes, usrRes, limRes, setRes, missRes] = await Promise.all([
        supabase.from("expenses").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*, user_roles (role)").order("created_at", { ascending: true }),
        supabase.from("category_limits").select("*"),
        supabase.from("settlements" as any).select("*"),
        supabase.from("missions").select("*"),
      ]);
      const err = expRes.error || usrRes.error || limRes.error || setRes.error || missRes.error;
      if (err) throw err;
      const profiles = usrRes.data || [];
      const missions = missRes.data || [];
      setExpenses((expRes.data || []).map(e => ({
        ...e,
        profiles: profiles.find((u: any) => u.id === e.user_id) || null,
        missions: missions.find((m: any) => m.id === e.mission_id) || null,
      })));
      setUsers(profiles);
      setLimits(limRes.data || []);
      setSettlements((setRes as any).data || []);
    } catch (err: any) {
      toast.error("Fetch failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const uniqueUsers = useMemo(() =>
    Array.from(new Set(expenses.map((e: any) => e.profiles?.name).filter(Boolean))) as string[],
  [expenses]);

  const uniqueMissions = useMemo(() => {
    const list = searchFilters.userEmails.length > 0
      ? expenses.filter((e: any) => searchFilters.userEmails.includes(e.profiles?.name))
      : expenses;
    return Array.from(new Set(list.map((e: any) => e.missions?.name).filter(Boolean))) as string[];
  }, [expenses, searchFilters.userEmails]);

  const filteredExpenses = useMemo(() => {
    const q = searchFilters.searchQuery.toLowerCase();
    return expenses.filter((e: any) => {
      const matchSearch  = !q || (e.profiles?.name||"").toLowerCase().includes(q) || (e.description||"").toLowerCase().includes(q) || (e.category||"").toLowerCase().includes(q);
      const matchUser    = searchFilters.userEmails.length === 0 || searchFilters.userEmails.includes(e.profiles?.name);
      const matchMission = searchFilters.missionName === "all" || e.missions?.name === searchFilters.missionName;
      const matchCat     = searchFilters.category    === "all" || e.category       === searchFilters.category;
      const matchStatus  = searchFilters.status      === "all" || e.status         === searchFilters.status;
      const expDate = e.date ? new Date(e.date).setHours(0,0,0,0) : null;
      const start   = searchFilters.startDate ? new Date(searchFilters.startDate).setHours(0,0,0,0) : null;
      const end     = searchFilters.endDate   ? new Date(searchFilters.endDate).setHours(0,0,0,0)   : null;
      const matchDate = (!start||(expDate&&expDate>=start)) && (!end||(expDate&&expDate<=end));
      return matchSearch && matchUser && matchMission && matchCat && matchStatus && matchDate;
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, searchFilters]);

  const createNotification = async (userId: string, type: string, title: string, message: string, relatedId?: string) => {
    try { await (supabase.from("notifications" as any) as any).insert({ user_id: userId, type, title, message, related_id: relatedId || null }); } catch {}
  };

  const approveExpense = async (id: string) => {
    const exp = expenses.find((e: any) => e.id === id);
    if (!exp) return;
    const newAmt = prompt(`Current: ₹${exp.amount}. Edit amount?`, exp.amount.toString());
    if (newAmt === null) return;
    const parsed = parseFloat(newAmt);
    if (isNaN(parsed) || parsed < 0) { toast.error("Invalid amount"); return; }
    const note = prompt("Add note for user:", "Approved by admin.");
    try {
      const { error } = await supabase.from("expenses").update({ status: "approved", amount: parsed, admin_note: note?.trim()||null, approved_by: user?.id, approved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      toast.success("Expense Approved!");
      await createNotification(exp.user_id, "expense_approved", "Expense Approved", `₹${parsed} (${exp.category}) approved.${note?' Note: '+note:''}`, id);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  };

  const rejectExpense = async (id: string) => {
    const reason = prompt("Rejection reason:");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("Please enter a reason."); return; }
    try {
      const { error } = await supabase.from("expenses").update({ status: "rejected", admin_note: reason.trim(), approved_by: user?.id, approved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      toast.success("Expense rejected");
      const exp = expenses.find((e: any) => e.id === id);
      if (exp) await createNotification(exp.user_id, "expense_rejected", "Expense Rejected", `₹${exp.amount} (${exp.category}) rejected. Reason: ${reason.trim()}`, id);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  };

  const deleteExpense = async (id: string) => {
    setIsActionLoading(id);
    try {
      const exp = expenses.find((e: any) => e.id === id);
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
      if (exp) await createNotification(exp.user_id, "expense_deleted", "Expense Deleted", `₹${exp.amount} (${exp.category}) was deleted by admin.`, id);
      setExpenses(prev => prev.filter((e: any) => e.id !== id));
      toast.success("Expense deleted.");
    } catch { toast.error("Unable to delete expense."); }
    finally { setIsActionLoading(null); setDeleteConfirmId(null); }
  };

  const exportCSV = () => {
    if (filteredExpenses.length === 0) return toast.error("No data to export");
    import("xlsx").then(XLSX => {
      const rows = filteredExpenses.map((e: any) => ({
        "Date": e.date, "Employee": e.profiles?.name||"N/A", "Mission": e.missions?.name||"General",
        "Category": e.category.toUpperCase(), "Description": e.description||"",
        "Amount (₹)": Number(e.amount), "Status": e.status.toUpperCase(),
        "Admin Note": e.admin_note||"", "Receipt": e.image_url||"",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expenses");
      XLSX.writeFile(wb, `Expenses_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success(`${filteredExpenses.length} records exported!`);
    });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-foreground p-5 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => navigate("/")} className="text-background/60 hover:text-background transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black italic tracking-tighter text-background">Admin Panel</h1>
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div className="flex flex-nowrap gap-1 w-full overflow-hidden items-stretch px-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 min-w-0 py-2.5 rounded-xl text-[7px] font-black uppercase tracking-tighter flex flex-col items-center justify-center gap-1 transition-all border ${
                tab === t.key ? "bg-primary text-primary-foreground border-transparent shadow-sm scale-[1.02]" : "bg-background/10 text-background/40 border-transparent"
              }`}>
              <span className="scale-75 origin-center">{t.icon}</span>
              <span className="truncate w-full text-center px-0.5">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pb-24">
        {tab === "expenses" && (
          <ExpensesTab
            expenses={expenses} users={users} uniqueUsers={uniqueUsers}
            uniqueMissions={uniqueMissions} filteredExpenses={filteredExpenses}
            searchFilters={searchFilters} setSearchFilters={setSearchFilters}
            approveExpense={approveExpense} rejectExpense={rejectExpense}
            deleteExpense={deleteExpense} isActionLoading={isActionLoading}
            deleteConfirmId={deleteConfirmId} setDeleteConfirmId={setDeleteConfirmId}
            exportCSV={exportCSV}
            isActive={tab === "expenses"}
          />
        )}
        {tab === "settlements" && (
          <SettlementsTab expenses={expenses} settlements={settlements} users={users} currentUserId={user?.id||""} onRefresh={loadData} />
        )}
        {tab === "users" && (
          <UsersTab users={users} currentUserId={user?.id||""} currentUserRole={role} currentUserEmail={user?.email} onRefresh={loadData} />
        )}
        {tab === "limits" && (
          <LimitsTab limits={limits} currentUserId={user?.id||""} onRefresh={loadData} />
        )}
        {tab === "reports" && (
          <ReportsTab expenses={expenses} settlements={settlements} users={users} uniqueUsers={uniqueUsers} />
        )}
        {tab === "journal" && <AdminJournalLogbook />}
        {tab === "fund" && <AdminFundTab settlements={settlements} users={users} onRefresh={loadData} />}
      </div>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirmId && deleteExpense(deleteConfirmId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
