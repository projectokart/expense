import { useMemo, useState } from "react";
import { Filter, LayoutGrid, Activity, BarChart3, FileSpreadsheet, Printer, ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import ImagePreviewModal from "@/components/expense/ImagePreviewModal";

interface Props {
  expenses: any[];
  settlements: any[];
  users: any[];
  uniqueUsers: string[];
}

const catColors: Record<string, string> = {
  travel: "#3B82F6", meal: "#F97316", hotel: "#8B5CF6",
  luggage: "#06B6D4", cash: "#6B7280", other: "#64748B",
};
const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function ReportsTab({ expenses, settlements, users, uniqueUsers }: Props) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedMissions, setSelectedMissions] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [step1Open, setStep1Open] = useState(false);
  const [step2Open, setStep2Open] = useState(false);

  const availableMissions = useMemo(() => {
    if (selectedUsers.length === 0) return [];
    const list = expenses.filter(e => selectedUsers.includes(e.profiles?.name || ""));
    return Array.from(new Set(list.map(e => e.missions?.name).filter(Boolean))) as string[];
  }, [expenses, selectedUsers]);

  const toggleUser = (name: string) => {
    const next = selectedUsers.includes(name)
      ? selectedUsers.filter(u => u !== name)
      : [...selectedUsers, name];
    setSelectedUsers(next);
    setSelectedMissions([]);
  };

  const toggleMission = (name: string) => {
    setSelectedMissions(prev =>
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
  };

  const selectAllMissions = () => {
    setSelectedMissions(
      selectedMissions.length === availableMissions.length ? [] : [...availableMissions]
    );
  };

  const hasData = selectedUsers.length > 0 && selectedMissions.length > 0;

  // All expenses for selected users+missions WITHOUT category/status filter
  // Used for correct totals & mission breakdown
  const baseFiltered = useMemo(() => {
    if (!hasData) return [];
    return expenses.filter(e => {
      const uName = e.profiles?.name || "";
      const mName = e.missions?.name || "";
      return selectedUsers.includes(uName) && selectedMissions.includes(mName);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedUsers, selectedMissions, hasData]);

  // Display list respects category/status filter
  const filtered = useMemo(() => {
    return baseFiltered.filter(e =>
      (catFilter === "all" || e.category === catFilter) &&
      (statusFilter === "all" || e.status === statusFilter)
    );
  }, [baseFiltered, catFilter, statusFilter]);

  // Mission-wise breakdown — FIX: settlements matched by mission_id only
  const missionBreakdown = useMemo(() => {
    return selectedMissions.map(mName => {
      const mExp = baseFiltered.filter(e => e.missions?.name === mName);
      const missionId = mExp[0]?.mission_id || null;

      const mApproved = mExp.filter(e => e.status === "approved" && e.category !== "cash");
      const mRejected = mExp.filter(e => e.status === "rejected");
      const mPending  = mExp.filter(e => e.status === "pending");

      const spent        = mApproved.reduce((s, e) => s + Number(e.amount), 0);
      const rejectedTotal = mRejected.reduce((s, e) => s + Number(e.amount), 0);

      // FIXED: Only settlements for THIS mission_id (not all user settlements)
      const missionSettlements = settlements.filter((s: any) => {
        const u = users.find((u: any) => u.id === s.user_id);
        return selectedUsers.includes(u?.name || "") && s.mission_id === missionId;
      });
      const received = missionSettlements.reduce((s: number, c: any) => s + Number(c.amount), 0);
      const pending  = spent - received;

      const userNames = [...new Set(mExp.map(e => e.profiles?.name).filter(Boolean))] as string[];

      return {
        name: mName, missionId,
        expenses: mExp, approvedList: mApproved, rejectedList: mRejected, pendingList: mPending,
        spent, rejectedTotal, received, pending, userNames, missionSettlements,
      };
    });
  }, [selectedMissions, baseFiltered, settlements, users, selectedUsers]);

  // Overall totals = sum of per-mission (correct)
  const totalApproved  = missionBreakdown.reduce((s, m) => s + m.spent, 0);
  const totalRejected  = missionBreakdown.reduce((s, m) => s + m.rejectedTotal, 0);
  const totalReceived  = missionBreakdown.reduce((s, m) => s + m.received, 0);
  const pendingPayable = totalApproved - totalReceived;

  const approvedList = baseFiltered.filter(e => e.status === "approved" && e.category !== "cash");
  const rejectedList = baseFiltered.filter(e => e.status === "rejected");

  const sanitize = (s: string) => {
    let c = String(s || "").replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(c)) c = "'" + c;
    return c;
  };

  const exportExcel = () => {
    if (baseFiltered.length === 0) return toast.error("No data to export");
    const rows: any[] = baseFiltered.map(e => ({
      "Date": e.date,
      "Employee": sanitize(e.profiles?.name || "N/A"),
      "Mission": sanitize(e.missions?.name || "General"),
      "Category": e.category.toUpperCase(),
      "Description": sanitize(e.description || ""),
      "Amount (₹)": Number(e.amount),
      "Status": e.status.toUpperCase(),
      "Admin Note": sanitize(e.admin_note || ""),
      "Receipt URL": e.image_url || "",
    }));
    missionBreakdown.forEach(md => {
      md.missionSettlements.forEach((s: any) => {
        const uName = users.find((u: any) => u.id === s.user_id)?.name || "";
        rows.push({
          "Date": s.created_at?.split("T")[0] || "",
          "Employee": sanitize(uName),
          "Mission": sanitize(md.name),
          "Category": "SETTLEMENT",
          "Description": sanitize(s.note || "Payment received"),
          "Amount (₹)": Number(s.amount),
          "Status": "RECEIVED",
          "Admin Note": "",
          "Receipt URL": s.proof_url || "",
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success(`${baseFiltered.length} records exported!`);
  };

  const printReport = () => {
    if (baseFiltered.length === 0) return toast.error("No data to print");

    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    const buildExpenseRows = (list: any[]) => list.map(e => {
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
        ? `<img src="${e.image_url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1.5px solid #e5e7eb;"/>`
        : `<div style="width:44px;height:44px;border-radius:8px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:8px;font-weight:700;">NO IMG</div>`;
      return `<tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 8px;font-size:10px;color:#6b7280;white-space:nowrap;">${e.date}</td>
        <td style="padding:7px 8px;font-size:10px;font-weight:700;">${e.profiles?.name || "Unknown"}</td>
        <td style="padding:7px 8px;"><span style="background:${col}18;color:${col};padding:2px 7px;border-radius:20px;font-size:9px;font-weight:800;text-transform:uppercase;">${e.category}</span></td>
        <td style="padding:7px 8px;font-size:10px;max-width:150px;word-break:break-word;">${e.description || "-"}</td>
        <td style="padding:7px 8px;text-align:right;font-size:11px;white-space:nowrap;${amtStyle}">${fmt(Number(e.amount))}</td>
        <td style="padding:7px 8px;text-align:center;">${badge}</td>
        <td style="padding:6px 8px;text-align:center;vertical-align:middle;">${imgHtml}</td>
      </tr>`;
    }).join("");

    const buildSettlementRows = (list: any[]) => list.map((s: any) => {
      const uName = users.find((u: any) => u.id === s.user_id)?.name || "Unknown";
      const imgHtml = s.proof_url
        ? `<img src="${s.proof_url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1.5px solid #e5e7eb;"/>`
        : `<div style="width:44px;height:44px;border-radius:8px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:8px;font-weight:700;">NO IMG</div>`;
      return `<tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 8px;font-size:10px;color:#6b7280;white-space:nowrap;">${s.created_at?.split("T")[0] || "-"}</td>
        <td style="padding:7px 8px;font-size:10px;font-weight:700;">${uName}</td>
        <td style="padding:7px 8px;font-size:10px;color:#555;">${s.note || "-"}</td>
        <td style="padding:7px 8px;text-align:right;font-size:11px;font-weight:800;color:#059669;">${fmt(Number(s.amount))}</td>
        <td style="padding:6px 8px;text-align:center;vertical-align:middle;">${imgHtml}</td>
      </tr>`;
    }).join("");

    const expenseTableHead = `<thead><tr style="border-bottom:2px solid #f1f5f9;">
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Date</th>
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Employee</th>
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Category</th>
      <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Description</th>
      <th style="padding:6px 8px;text-align:right;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Amount</th>
      <th style="padding:6px 8px;text-align:center;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Status</th>
      <th style="padding:6px 8px;text-align:center;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Receipt</th>
    </tr></thead>`;

    const missionSections = missionBreakdown.map(md => {
      const pendingColor = md.pending > 0 ? "#dc2626" : "#059669";

      const approvedSec = md.approvedList.length > 0 ? `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0 5px;">
            <div style="width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
            <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#059669;letter-spacing:0.08em;">Approved Expenses</span>
            <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${md.approvedList.length} records &nbsp;·&nbsp; ${fmt(md.spent)}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${expenseTableHead}
            <tbody>
              ${buildExpenseRows(md.approvedList)}
              <tr style="border-top:2px solid #e2e8f0;">
                <td colspan="4" style="padding:8px;text-align:right;font-size:8px;font-weight:800;color:#6b7280;text-transform:uppercase;">Approved Total</td>
                <td style="padding:8px;text-align:right;font-size:12px;font-weight:900;color:#059669;">${fmt(md.spent)}</td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>
        </div>` : "";

      const rejectedSec = md.rejectedList.length > 0 ? `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0 5px;">
            <div style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;"></div>
            <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#dc2626;letter-spacing:0.08em;">Rejected Expenses</span>
            <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${md.rejectedList.length} records &nbsp;·&nbsp; ${fmt(md.rejectedTotal)}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${expenseTableHead}
            <tbody>${buildExpenseRows(md.rejectedList)}</tbody>
          </table>
        </div>` : "";

      const settlementSec = md.missionSettlements.length > 0 ? `
        <div style="margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0 5px;">
            <div style="width:7px;height:7px;border-radius:50%;background:#2563eb;flex-shrink:0;"></div>
            <span style="font-size:9px;font-weight:800;text-transform:uppercase;color:#2563eb;letter-spacing:0.08em;">Amount Received</span>
            <span style="font-size:8px;color:#94a3b8;margin-left:auto;">${md.missionSettlements.length} payment${md.missionSettlements.length > 1 ? "s" : ""} &nbsp;·&nbsp; ${fmt(md.received)}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="border-bottom:2px solid #f1f5f9;">
              <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Date</th>
              <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Employee</th>
              <th style="padding:6px 8px;text-align:left;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Note</th>
              <th style="padding:6px 8px;text-align:right;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Amount</th>
              <th style="padding:6px 8px;text-align:center;font-size:7px;font-weight:800;text-transform:uppercase;color:#94a3b8;">Proof</th>
            </tr></thead>
            <tbody>
              ${buildSettlementRows(md.missionSettlements)}
              <tr style="border-top:2px solid #e2e8f0;">
                <td colspan="3" style="padding:8px;text-align:right;font-size:8px;font-weight:800;color:#6b7280;text-transform:uppercase;">Total Received</td>
                <td style="padding:8px;text-align:right;font-size:12px;font-weight:900;color:#2563eb;">${fmt(md.received)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>` : "";

      return `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;margin-bottom:20px;overflow:hidden;page-break-inside:avoid;">
          <div style="background:linear-gradient(135deg,#1e3a5f,#0f2444);padding:14px 20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <div>
                <div style="font-size:13px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:0.05em;">${md.name}</div>
                <div style="font-size:9px;color:#94a3b8;margin-top:2px;">Employees: ${md.userNames.join(", ")}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Net Pending</div>
                <div style="font-size:16px;font-weight:900;color:${pendingColor};">${fmt(Math.abs(md.pending))}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 14px;text-align:center;">
                <div style="font-size:7px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Approved</div>
                <div style="font-size:13px;font-weight:900;color:#34d399;">${fmt(md.spent)}</div>
              </div>
              <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 14px;text-align:center;">
                <div style="font-size:7px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Received</div>
                <div style="font-size:13px;font-weight:900;color:#60a5fa;">${fmt(md.received)}</div>
              </div>
              <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 14px;text-align:center;">
                <div style="font-size:7px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Rejected</div>
                <div style="font-size:13px;font-weight:900;color:#f87171;">${fmt(md.rejectedTotal)}</div>
              </div>
              <div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:6px 14px;text-align:center;">
                <div style="font-size:7px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Records</div>
                <div style="font-size:13px;font-weight:900;color:#fff;">${md.expenses.length}</div>
              </div>
            </div>
          </div>
          <div style="padding:16px 20px;">
            ${approvedSec}
            ${rejectedSec}
            ${settlementSec}
          </div>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Expense Report</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; }
.page { max-width:980px; margin:0 auto; background:#fff; }
@media print {
  @page { size:A4 portrait; margin:8mm; }
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; background:#fff; }
  .no-print { display:none !important; }
  .page { max-width:100%; }
}
</style></head><body>
<div class="page">
  <div style="background:linear-gradient(135deg,#1e3a5f,#0f2444);color:#fff;padding:28px 36px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-0.5px;">Expense<span style="color:#34d399;">.</span>Report</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:8px;line-height:2;">
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;">Official Expense Summary</div>
          <div>Generated: ${today}</div>
          <div>Employees: ${selectedUsers.join(", ")}</div>
          <div>Missions: ${selectedMissions.join(" · ")}</div>
        </div>
      </div>
      <div style="text-align:right;font-size:10px;color:#94a3b8;line-height:2;">
        <div style="font-size:12px;font-weight:700;color:#34d399;">Financial Overview</div>
        <div>Approved: ${approvedList.length} entries</div>
        <div>Rejected: ${rejectedList.length} entries</div>
        <div>Total Records: ${baseFiltered.length}</div>
      </div>
    </div>
  </div>

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
      <div style="font-size:18px;font-weight:900;color:${pendingPayable > 0 ? "#dc2626" : "#059669"};">${fmt(Math.abs(pendingPayable))}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #e2e8f0;">
      <div style="font-size:7px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:4px;">Total Rejected</div>
      <div style="font-size:18px;font-weight:900;color:#dc2626;">-${fmt(totalRejected)}</div>
    </div>
  </div>

  <div style="padding:24px 36px;">
    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:14px;">Mission Wise Breakdown</div>
    ${missionSections}
  </div>

  <div style="background:#f8fafc;border-top:2px solid #e2e8f0;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#6b7280;">
      <div style="font-weight:800;color:#374151;font-size:11px;margin-bottom:3px;">Final Summary</div>
      <div>Approved: ${fmt(totalApproved)} &nbsp;|&nbsp; Received: ${fmt(totalReceived)} &nbsp;|&nbsp; Rejected: -${fmt(totalRejected)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:8px;color:#94a3b8;margin-bottom:2px;font-weight:700;text-transform:uppercase;">Net Payable</div>
      <div style="font-size:16px;font-weight:900;color:${pendingPayable > 0 ? "#dc2626" : "#059669"};">${fmt(Math.max(0, pendingPayable))}</div>
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
    if (!w) return toast.error("Popup blocked! Allow popups and try again.");
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-3 animate-fade-in pb-24 px-3 relative">

      {/* FILTER PANEL */}
      <div className="bg-white rounded-[1.6rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-gray-400" />
            <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Filters</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedUsers.length > 0 && (
              <span className="text-[7px] font-black text-white px-2 py-0.5 rounded-full" style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)"}}>
                {selectedUsers.map(u => u.split(" ")[0]).join(", ")}
              </span>
            )}
            {selectedMissions.length > 0 && (
              <span className="text-[7px] font-black text-white px-2 py-0.5 rounded-full" style={{background:"linear-gradient(135deg,#7c3aed,#6d28d9)"}}>
                {selectedMissions.length} mission{selectedMissions.length > 1 ? "s" : ""}
              </span>
            )}
            {(selectedUsers.length > 0 || selectedMissions.length > 0) && (
              <button
                onClick={() => { setSelectedUsers([]); setSelectedMissions([]); setStep1Open(false); setStep2Open(false); }}
                className="text-[7px] font-black uppercase text-rose-400 bg-rose-50 px-2 py-1 rounded-full">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Step 1 — Employee */}
        <div className="border-t border-gray-50">
          <button onClick={() => setStep1Open(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[7px] font-black"
              style={{background: selectedUsers.length > 0 ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#e5e7eb"}}>
              {selectedUsers.length > 0 ? "✓" : "1"}
            </div>
            <span className="text-[9px] font-black uppercase text-gray-600 flex-1 text-left">
              Employee
              {selectedUsers.length > 0 && <span className="ml-2 font-bold text-gray-400 normal-case">({selectedUsers.length} selected)</span>}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${step1Open ? "rotate-180" : ""}`} />
          </button>
          {step1Open && (
            <div className="px-3 pb-3 animate-in slide-in-from-top-1 duration-150">
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-xl bg-gray-50 p-1.5">
                {uniqueUsers.map((name: string) => {
                  const sel = selectedUsers.includes(name);
                  return (
                    <button key={name} onClick={() => toggleUser(name)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95 ${sel ? "text-white" : "bg-white text-gray-700 border border-gray-100"}`}
                      style={sel ? {background:"linear-gradient(135deg,#2563eb,#1d4ed8)"} : {}}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? "bg-white border-white" : "border-gray-300"}`}>
                        {sel && <div className="w-2 h-2 rounded-full" style={{background:"#2563eb"}} />}
                      </div>
                      <span className="text-[11px] font-black uppercase">{name}</span>
                    </button>
                  );
                })}
              </div>
              {selectedUsers.length > 0 && (
                <button onClick={() => { setStep1Open(false); setStep2Open(true); }}
                  className="w-full mt-2 py-2 text-white text-[8px] font-black uppercase rounded-xl active:scale-95 transition-all"
                  style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)"}}>
                  Next → Select Mission
                </button>
              )}
            </div>
          )}
        </div>

        {/* Step 2 — Mission */}
        <div className="border-t border-gray-50">
          <button
            onClick={() => selectedUsers.length > 0 && setStep2Open(o => !o)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${selectedUsers.length === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"}`}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[7px] font-black"
              style={{background: selectedMissions.length > 0 ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "#e5e7eb"}}>
              {selectedMissions.length > 0 ? "✓" : "2"}
            </div>
            <span className="text-[9px] font-black uppercase text-gray-600 flex-1 text-left">
              Mission
              {selectedMissions.length > 0 && <span className="ml-2 font-bold text-gray-400 normal-case">({selectedMissions.length} selected)</span>}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${step2Open ? "rotate-180" : ""}`} />
          </button>
          {step2Open && selectedUsers.length > 0 && (
            <div className="px-3 pb-3 animate-in slide-in-from-top-1 duration-150">
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto rounded-xl bg-gray-50 p-1.5">
                {availableMissions.length > 0 && (
                  <button onClick={selectAllMissions}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95 border-2 ${
                      selectedMissions.length === availableMissions.length ? "text-white border-transparent" : "bg-white text-gray-600 border-dashed border-gray-200"
                    }`}
                    style={selectedMissions.length === availableMissions.length ? {background:"linear-gradient(135deg,#7c3aed,#6d28d9)"} : {}}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedMissions.length === availableMissions.length ? "bg-white border-white" : "border-gray-300"}`}>
                      {selectedMissions.length === availableMissions.length && <div className="w-2 h-2 rounded-full" style={{background:"#7c3aed"}} />}
                    </div>
                    <span className="text-[10px] font-black uppercase flex-1">All Missions</span>
                    <span className={`text-[7px] font-bold ${selectedMissions.length === availableMissions.length ? "text-white/60" : "text-gray-400"}`}>{availableMissions.length}</span>
                  </button>
                )}
                {availableMissions.map((m: string) => {
                  const sel = selectedMissions.includes(m);
                  return (
                    <button key={m} onClick={() => toggleMission(m)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95 ${sel ? "text-white" : "bg-white text-gray-700 border border-gray-100"}`}
                      style={sel ? {background:"linear-gradient(135deg,#7c3aed,#6d28d9)"} : {}}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? "bg-white border-white" : "border-gray-300"}`}>
                        {sel && <div className="w-2 h-2 rounded-full" style={{background:"#7c3aed"}} />}
                      </div>
                      <span className="text-[10px] font-black uppercase truncate flex-1">{m}</span>
                    </button>
                  );
                })}
                {availableMissions.length === 0 && <p className="text-[8px] text-gray-400 text-center py-3 font-bold">No missions found</p>}
              </div>
              {selectedMissions.length > 0 && (
                <button onClick={() => setStep2Open(false)}
                  className="w-full mt-2 py-2 text-white text-[8px] font-black uppercase rounded-xl active:scale-95 transition-all"
                  style={{background:"linear-gradient(135deg,#7c3aed,#6d28d9)"}}>
                  Done — View Report ↓
                </button>
              )}
            </div>
          )}
        </div>

        {/* Category + Status filters */}
        {hasData && (
          <div className="border-t border-gray-50 grid grid-cols-2 gap-2 px-3 py-3">
            <div className="relative">
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="w-full bg-gray-50 p-2.5 rounded-xl text-[8px] font-black uppercase outline-none appearance-none border border-gray-100">
                <option value="all">All Categories</option>
                {["travel","meal","hotel","luggage","other"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <LayoutGrid className="absolute right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full bg-gray-50 p-2.5 rounded-xl text-[8px] font-black uppercase outline-none appearance-none border border-gray-100">
                <option value="all">All Status</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="pending">Pending</option>
              </select>
              <Activity className="absolute right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* EMPTY STATE */}
      {!hasData ? (
        <div className="rounded-[1.6rem] p-8 text-center text-white" style={{background:"linear-gradient(135deg,#1e3a5f,#0f2444)"}}>
          {selectedUsers.length === 0 ? (
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{background:"rgba(255,255,255,0.1)"}}>
                <span className="text-lg">👤</span>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Select Employee</p>
              <p className="text-[8px] text-white/40">Step 1 — Choose employee(s) above</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{background:"rgba(255,255,255,0.1)"}}>
                <span className="text-lg">🚀</span>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">Select Mission(s)</p>
              <p className="text-[8px] text-white/40">Step 2 — Pick one or more missions</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* OVERALL SUMMARY CARD */}
          <div className="rounded-[1.6rem] p-4 text-white relative overflow-hidden" style={{background:"linear-gradient(135deg,#1e3a5f,#0f2444)"}}>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedUsers.map(u => (
                <span key={u} className="text-[7px] font-black uppercase px-2 py-0.5 rounded-full" style={{background:"rgba(255,255,255,0.12)"}}>👤 {u}</span>
              ))}
              {selectedMissions.map(m => (
                <span key={m} className="text-[7px] font-black uppercase px-2 py-0.5 rounded-full" style={{background:"rgba(124,58,237,0.4)"}}>🚀 {m}</span>
              ))}
            </div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-emerald-400 opacity-80 mb-0.5">Total Approved</p>
                <h2 className="text-3xl font-black tracking-tighter">{fmt(totalApproved)}</h2>
              </div>
              <div className="p-2 rounded-xl" style={{background:"rgba(255,255,255,0.1)"}}>
                <BarChart3 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 border-t border-white/10 pt-3">
              {[
                {label:"Received", val:fmt(totalReceived), color:"text-emerald-400"},
                {label:"Rejected", val:fmt(totalRejected), color:"text-rose-400"},
                {label:"Pending", val:fmt(Math.abs(pendingPayable)), color: pendingPayable > 0 ? "text-amber-400" : "text-emerald-400"},
                {label:"Records", val:String(baseFiltered.length), color:"text-white"},
              ].map(s => (
                <div key={s.label} className="rounded-xl p-2 text-center" style={{background:"rgba(255,255,255,0.06)"}}>
                  <p className="text-[6px] font-black uppercase text-white/30 mb-1">{s.label}</p>
                  <p className={`text-[9px] font-black ${s.color}`}>{s.val}</p>
                </div>
              ))}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 opacity-10 flex items-end gap-0.5 px-4">
              {[40,70,45,90,65,80,30,50,85,40].map((h,i) => <div key={i} className="flex-1 bg-white rounded-t-sm" style={{height:`${h}%`}} />)}
            </div>
          </div>

          {/* MISSION-WISE CARDS */}
          <div className="space-y-2">
            <p className="text-[7px] font-black uppercase opacity-40 tracking-widest px-1">Mission Wise Breakdown</p>
            {missionBreakdown.map((md: any) => {
              const isOpen = expandedMission === md.name;
              return (
                <div key={md.name} className="bg-white rounded-[1.4rem] border border-gray-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedMission(isOpen ? null : md.name)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:"linear-gradient(135deg,#7c3aed,#6d28d9)"}} />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[10px] font-black uppercase text-gray-900 truncate">{md.name}</p>
                      <p className="text-[7px] text-gray-400 font-bold truncate">{md.userNames.join(", ")}</p>
                    </div>
                    <div className="text-right flex-shrink-0 mr-1">
                      <p className="text-[12px] font-black text-gray-900">{fmt(md.spent)}</p>
                      <p className="text-[7px] text-gray-400">{md.expenses.length} records</p>
                    </div>
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-50 bg-gray-50 px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white rounded-xl p-2.5 text-center border border-gray-100">
                          <p className="text-[6px] font-black uppercase text-gray-400">Approved</p>
                          <p className="text-[11px] font-black text-gray-900 mt-0.5">{fmt(md.spent)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-2.5 text-center border border-emerald-100">
                          <p className="text-[6px] font-black uppercase text-emerald-500">Received</p>
                          <p className="text-[11px] font-black text-emerald-700 mt-0.5">{fmt(md.received)}</p>
                        </div>
                        <div className={`rounded-xl p-2.5 text-center border ${md.pending > 0 ? "bg-white border-rose-100" : "bg-white border-emerald-100"}`}>
                          <p className={`text-[6px] font-black uppercase ${md.pending > 0 ? "text-rose-400" : "text-emerald-500"}`}>Pending</p>
                          <p className={`text-[11px] font-black mt-0.5 ${md.pending > 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(Math.abs(md.pending))}</p>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {md.expenses.slice(0, 20).map((e: any, i: number) => (
                          <div key={i} className="bg-white rounded-xl px-3 py-2 flex items-center gap-2.5 border border-gray-100">
                            {e.image_url ? (
                              <div onClick={() => setSelectedPreviewImage(e.image_url)}
                                className="w-8 h-8 rounded-lg border border-gray-100 overflow-hidden cursor-pointer flex-shrink-0">
                                <img src={e.image_url} className="w-full h-full object-cover" alt="r" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
                                <ImageIcon className="w-2.5 h-2.5 text-gray-300" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[8px] font-black text-gray-400">{e.date} · {e.profiles?.name}</p>
                              <p className="text-[9px] font-bold text-gray-800 truncate">{e.description || "No description"}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[10px] font-black text-gray-900">{fmt(Number(e.amount))}</p>
                              <span className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                e.status === "approved" ? "bg-emerald-50 text-emerald-600"
                                : e.status === "rejected" ? "bg-rose-50 text-rose-500"
                                : "bg-amber-50 text-amber-500"
                              }`}>{e.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Export Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={exportExcel}
              className="py-3.5 text-white rounded-[1.2rem] font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{background:"linear-gradient(135deg,#059669,#047857)"}}>
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
            <button onClick={printReport}
              className="py-3.5 text-white rounded-[1.2rem] font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{background:"linear-gradient(135deg,#1e3a5f,#0f2444)"}}>
              <Printer className="w-4 h-4" /> Print Report
            </button>
          </div>
        </>
      )}

      <ImagePreviewModal imageUrl={selectedPreviewImage} onClose={() => setSelectedPreviewImage(null)} />
    </div>
  );
}
