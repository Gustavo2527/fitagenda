import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { usePushSubscription } from "@/hooks/usePushSubscription";

export default function NotificationPermissionModal() {
  const [open, setOpen] = useState(false);
  const { subscribe } = usePushSubscription();

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAllow = async () => {
    const result = await Notification.requestPermission();
    setOpen(false);
    if (result === "granted") {
      toast.success("Notificações ativadas com sucesso!");
      // Subscribe to push after permission granted
      await subscribe();
    } else {
      toast.info("Você pode ativar as notificações depois nas configurações do navegador.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Ative as notificações</DialogTitle>
          <DialogDescription className="text-center text-base">
            Ative as notificações para receber lembretes das suas aulas e nunca perder um compromisso!
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleAllow} className="w-full">
            Ativar notificações
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} className="w-full">
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}