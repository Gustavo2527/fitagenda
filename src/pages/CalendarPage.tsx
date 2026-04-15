import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useNotificationActions } from "@/contexts/NotificationContext";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CalendarPage() {
  const { user } = useAuth();
  const { rescheduleToday } = useNotificationActions();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: sessions } = useQuery({
    queryKey: ["sessions-week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*, clients(name)")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(addDays(weekStart, 6), "yyyy-MM-dd"))
        .order("start_time");
      return data ?? [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, remaining_credits").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").insert({
        user_id: user!.id,
        client_id: clientId,
        date: format(selectedDate, "yyyy-MM-dd"),
        start_time: startTime,
        end_time: endTime,
        notes: notes || null,
      });
      if (error) throw error;

      // Deduzir 1 crédito
      const client = clients?.find((c) => c.id === clientId);
      if (client && client.remaining_credits > 0) {
        await supabase
          .from("clients")
          .update({ remaining_credits: client.remaining_credits - 1 })
          .eq("id", clientId);
      }

      // Schedule server-side notifications for this session
      try {
        await supabase.functions.invoke("schedule-notifications", {
          body: { user_id: user!.id, date: format(selectedDate, "yyyy-MM-dd") },
        });
        console.log("[CalendarPage] Server notifications scheduled for", format(selectedDate, "yyyy-MM-dd"));
      } catch (err) {
        console.warn("[CalendarPage] Failed to schedule server notifications:", err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions-week"] });
      qc.invalidateQueries({ queryKey: ["sessions-today"] });
      qc.invalidateQueries({ queryKey: ["clients-list"] });
      toast.success("Aula agendada");
      rescheduleToday();
      setOpen(false);
      setClientId("");
      setNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusLabels: Record<string, string> = {
    scheduled: "Agendada",
    completed: "Concluída",
    cancelled: "Cancelada",
    no_show: "Faltou",
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, date }: { id: string; status: string; date: string }) => {
      const { error } = await supabase.from("sessions").update({ status: status as any }).eq("id", id);
      if (error) throw error;

      // Re-schedule notifications for this date
      try {
        await supabase.functions.invoke("schedule-notifications", {
          body: { user_id: user!.id, date },
        });
      } catch (err) {
        console.warn("[CalendarPage] Failed to reschedule notifications:", err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions-week"] });
      qc.invalidateQueries({ queryKey: ["sessions-today"] });
      rescheduleToday();
      toast.success("Aula atualizada");
    },
  });

  const daySessions = sessions?.filter((s) => isSameDay(parseISO(s.date), selectedDate)) ?? [];

  const statusColors: Record<string, string> = {
    scheduled: "bg-primary/20 text-primary",
    completed: "bg-success/20 text-success",
    cancelled: "bg-destructive/20 text-destructive",
    no_show: "bg-warning/20 text-warning",
  };

  return (
    <div className="safe-bottom min-h-screen bg-background">
      <PageHeader
        title="Agenda"
        subtitle={format(currentDate, "MMMM yyyy", { locale: ptBR })}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-primary text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" /> Aula
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading">Nova Aula</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createSession.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={format(selectedDate, "yyyy-MM-dd")} onChange={(e) => setSelectedDate(new Date(e.target.value + "T12:00:00"))} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Aluno *</Label>
                  <Select value={clientId} onValueChange={setClientId} required>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione o aluno" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.remaining_credits} créditos)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Início</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim</Label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-secondary border-border" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações opcionais" className="bg-secondary border-border" />
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={createSession.isPending}>
                  {createSession.isPending ? "Agendando..." : "Agendar Aula"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Navegação da Semana */}
      <div className="flex items-center justify-between px-4 pb-3">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex gap-1.5">
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const hasSession = sessions?.some((s) => isSameDay(parseISO(s.date), day));
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`flex w-10 flex-col items-center gap-0.5 rounded-xl py-2 text-xs transition-all ${
                  isSelected
                    ? "gradient-primary text-primary-foreground glow-primary"
                    : isToday
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span className="font-medium">{format(day, "EEE", { locale: ptBR }).slice(0, 3)}</span>
                <span className="text-sm font-bold">{format(day, "d")}</span>
                {hasSession && !isSelected && <span className="h-1 w-1 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Aulas do Dia */}
      <div className="px-4">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h3>
        {daySessions.length === 0 ? (
          <div className="glass-card rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma aula neste dia</p>
          </div>
        ) : (
          <div className="space-y-2">
            {daySessions.map((session) => (
              <div key={session.id} className="glass-card rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{(session.clients as any)?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <Select
                    value={session.status}
                    onValueChange={(status) => updateStatus.mutate({ id: session.id, status, date: session.date })}
                  >
                    <SelectTrigger className={`w-auto gap-1 border-0 text-xs ${statusColors[session.status]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Agendada</SelectItem>
                      <SelectItem value="completed">Concluída</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                      <SelectItem value="no_show">Faltou</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {session.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{session.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}