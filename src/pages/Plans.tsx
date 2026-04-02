import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Dumbbell, Archive } from "lucide-react";

export default function Plans() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sessions, setSessions] = useState("");
  const [price, setPrice] = useState("");

  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const createPlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("plans").insert({
        user_id: user!.id,
        name,
        description: description || null,
        total_sessions: parseInt(sessions),
        price: parseFloat(price),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano criado");
      setOpen(false);
      setName("");
      setDescription("");
      setSessions("");
      setPrice("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePlan = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("plans").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano atualizado");
    },
  });

  return (
    <div className="safe-bottom min-h-screen bg-background">
      <PageHeader
        title="Planos"
        subtitle="Gerencie seus pacotes"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-primary text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading">Novo Plano</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createPlan.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Nome do Plano *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Pacote Iniciante" className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição" className="bg-secondary border-border" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Aulas *</Label>
                    <Input type="number" min="1" value={sessions} onChange={(e) => setSessions(e.target.value)} required placeholder="5" className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço (R$) *</Label>
                    <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="80,00" className="bg-secondary border-border" />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={createPlan.isPending}>
                  {createPlan.isPending ? "Criando..." : "Criar Plano"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-2 px-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
            ))}
          </div>
        ) : plans?.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <Dumbbell className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">Nenhum plano ainda. Crie seu primeiro plano!</p>
          </div>
        ) : (
          plans?.map((plan) => (
            <div key={plan.id} className={`glass-card rounded-xl p-4 ${!plan.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-semibold text-foreground">{plan.name}</h3>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      v{plan.version}
                    </span>
                  </div>
                  {plan.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>
                  )}
                  <div className="mt-2 flex gap-4 text-sm">
                    <span className="text-foreground">
                      <strong className="text-primary">{plan.total_sessions}</strong> aulas
                    </span>
                    <span className="text-foreground">
                      <strong className="text-primary">R${plan.price}</strong>
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => togglePlan.mutate({ id: plan.id, is_active: plan.is_active })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}