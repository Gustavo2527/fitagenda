import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, User, CreditCard } from "lucide-react";

export default function Clients() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("*, plans(name, total_sessions, price)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["plans-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const createClient = useMutation({
    mutationFn: async () => {
      const selectedPlan = plans?.find((p) => p.id === planId);
      const { error } = await supabase.from("clients").insert({
        user_id: user!.id,
        name,
        email: email || null,
        phone: phone || null,
        assigned_plan_id: planId || null,
        remaining_credits: selectedPlan?.total_sessions ?? 0,
        plan_start_date: planId ? new Date().toISOString().split("T")[0] : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["active-clients-count"] });
      toast.success("Aluno adicionado");
      setOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      setPlanId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="safe-bottom min-h-screen bg-background">
      <PageHeader
        title="Alunos"
        subtitle={`${clients?.length ?? 0} no total`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-primary text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading">Novo Aluno</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createClient.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Atribuir Plano</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.total_sessions} aulas – R${p.price})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={createClient.isPending}>
                  {createClient.isPending ? "Adicionando..." : "Adicionar Aluno"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-2 px-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
            ))}
          </div>
        ) : clients?.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <User className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">Nenhum aluno ainda. Adicione seu primeiro aluno!</p>
          </div>
        ) : (
          clients?.map((client) => (
            <div key={client.id} className="glass-card flex items-center gap-3 rounded-xl p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <span className="font-heading text-sm font-bold text-primary">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{client.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(client.plans as any)?.name ?? "Sem plano"} • {client.remaining_credits} créditos restantes
                </p>
              </div>
              <div className="flex items-center gap-1">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className={`text-xs font-medium ${client.is_active ? "text-primary" : "text-muted-foreground"}`}>
                  {client.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}