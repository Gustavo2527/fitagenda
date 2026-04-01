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
import { Plus, DollarSign, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Payments() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("*, clients(name), plans(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-payment"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, assigned_plan_id").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["plans-for-payment"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, name, price").eq("is_active", true);
      return data ?? [];
    },
  });

  const createPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payments").insert({
        user_id: user!.id,
        client_id: clientId,
        plan_id: planId || null,
        amount: parseFloat(amount),
        payment_method: method || null,
        status: "pending" as const,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["pending-payments-count"] });
      toast.success("Payment recorded");
      setOpen(false);
      setClientId("");
      setPlanId("");
      setAmount("");
      setMethod("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmPayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payments")
        .update({ status: "paid" as const, payment_date: new Date().toISOString().split("T")[0] })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["pending-payments-count"] });
      qc.invalidateQueries({ queryKey: ["monthly-revenue"] });
      toast.success("Payment confirmed");
    },
  });

  // Auto-fill amount when plan selected
  const handlePlanChange = (id: string) => {
    setPlanId(id);
    const plan = plans?.find((p) => p.id === id);
    if (plan) setAmount(String(plan.price));
  };

  const monthlyTotal = payments
    ?.filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  return (
    <div className="safe-bottom min-h-screen bg-background">
      <PageHeader
        title="Payments"
        subtitle={`$${monthlyTotal.toFixed(0)} total revenue`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-primary text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" /> Record
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-heading">Record Payment</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createPayment.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Client *</Label>
                  <Select value={clientId} onValueChange={setClientId} required>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select value={planId} onValueChange={handlePlanChange}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} – ${p.price}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount ($) *</Label>
                    <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash, PIX..." className="bg-secondary border-border" />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={createPayment.isPending}>
                  {createPayment.isPending ? "Saving..." : "Record Payment"}
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
        ) : payments?.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center">
            <DollarSign className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">No payments recorded yet</p>
          </div>
        ) : (
          payments?.map((payment) => (
            <div key={payment.id} className="glass-card flex items-center gap-3 rounded-xl p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                payment.status === "paid" ? "bg-success/10" : "bg-warning/10"
              }`}>
                {payment.status === "paid" ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : (
                  <Clock className="h-5 w-5 text-warning" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{(payment.clients as any)?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(payment.plans as any)?.name ?? "Custom"} • {payment.payment_date ? format(new Date(payment.payment_date), "MMM d") : "Pending"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading font-bold text-foreground">${Number(payment.amount).toFixed(0)}</p>
                {payment.status === "pending" && (
                  <button
                    onClick={() => confirmPayment.mutate(payment.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    Confirm
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
