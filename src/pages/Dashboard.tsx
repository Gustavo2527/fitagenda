import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Users, Calendar, DollarSign, TrendingUp, Bell } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

  const { data: todaySessions } = useQuery({
    queryKey: ["sessions-today", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*, clients(name)")
        .eq("date", today)
        .order("start_time");
      return data ?? [];
    },
  });

  const { data: activeClients } = useQuery({
    queryKey: ["active-clients-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      return count ?? 0;
    },
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ["pending-payments-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  const { data: monthlyRevenue } = useQuery({
    queryKey: ["monthly-revenue", monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("amount")
        .eq("status", "paid")
        .gte("payment_date", monthStart);
      return data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
    },
  });

  const statusLabels: Record<string, string> = {
    scheduled: "Agendada",
    completed: "Concluída",
    cancelled: "Cancelada",
    no_show: "Faltou",
  };

  const stats = [
    { label: "Aulas Hoje", value: todaySessions?.length ?? 0, icon: Calendar, color: "text-primary", onClick: () => navigate("/calendar") },
    { label: "Alunos Ativos", value: activeClients ?? 0, icon: Users, color: "text-accent-foreground", onClick: () => navigate("/clients") },
    { label: "Pgtos Pendentes", value: pendingPayments ?? 0, icon: DollarSign, color: "text-warning", onClick: () => navigate("/payments") },
    { label: "Receita Mensal", value: `R$${(monthlyRevenue ?? 0).toFixed(0)}`, icon: TrendingUp, color: "text-primary", onClick: () => navigate("/payments") },
  ];

  const statusColors: Record<string, string> = {
    scheduled: "bg-primary/20 text-primary",
    completed: "bg-success/20 text-success",
    cancelled: "bg-destructive/20 text-destructive",
    no_show: "bg-warning/20 text-warning",
  };

  const testNotification = async () => {
    const results: string[] = [];

    // 1. Permission
    const perm = "Notification" in window ? Notification.permission : "API indisponível";
    results.push(`Permissão: ${perm}`);

    // 2. SW status
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        results.push(`SW ativo: ${reg.active?.state ?? "sem active"}`);

        // 3. Test notification via SW
        if (perm === "granted") {
          await reg.showNotification("🔔 Teste FitAgenda", {
            body: "Se você está vendo isso, as notificações funcionam!",
            icon: "/icon-192x192.png",
            tag: "test-notification",
          });
          results.push("Notificação de teste disparada ✅");
        } else {
          results.push("Notificação NÃO disparada (permissão não concedida)");
        }
      } catch (err) {
        results.push(`Erro SW: ${err}`);
      }
    } else {
      results.push("Service Worker não suportado");
    }

    // 4. Standalone check
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    results.push(`Modo standalone: ${isStandalone ? "Sim" : "Não"}`);

    alert(results.join("\n"));
  };

  return (
    <div className="safe-bottom min-h-screen bg-background">
      <PageHeader title="Painel" subtitle="Bem-vindo de volta, treinador 💪" />

      {/* Botão de teste temporário — remover depois */}
      <div className="px-4 mb-4">
        <Button onClick={testNotification} variant="outline" className="w-full gap-2">
          <Bell className="h-4 w-4" />
          Testar Notificação
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4">
        {stats.map((stat) => (
          <button
            key={stat.label}
            onClick={stat.onClick}
            className="glass-card animate-fade-up rounded-xl p-4 text-left transition-transform active:scale-[0.98]"
          >
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
            <p className="mt-3 font-heading text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">Agenda de Hoje</h2>
        {todaySessions?.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <p className="text-muted-foreground">Nenhuma aula agendada para hoje</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todaySessions?.map((session) => (
              <div key={session.id} className="glass-card flex items-center gap-3 rounded-xl p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {(session.clients as any)?.name ?? "Desconhecido"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[session.status] ?? ""}`}>
                  {statusLabels[session.status] ?? session.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}