import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  sessionId: string | null;
  clientName: string;
  onConfirm: (sessionId: string, status: "completed" | "no_show") => void;
  onClose: () => void;
}

export default function SessionCompletionModal({ open, sessionId, clientName, onConfirm, onClose }: Props) {
  if (!sessionId) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">A aula foi realizada?</DialogTitle>
          <DialogDescription className="text-center text-base">
            Aula com <span className="font-semibold text-foreground">{clientName}</span> — foi concluída?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => onConfirm(sessionId, "completed")}
            className="flex-1 gap-2"
          >
            <CheckCircle className="h-5 w-5" />
            Sim
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(sessionId, "no_show")}
            className="flex-1 gap-2"
          >
            <XCircle className="h-5 w-5" />
            Não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
