import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, X } from "lucide-react";
import { isIOS, getIOSVersion } from "@/lib/ios-detection";

export default function IOSVersionWarning() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isIOS()) {
      const version = getIOSVersion();
      if (version !== null && version < 16.4) {
        setShow(true);
      }
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50">
      <Alert className="border-yellow-500/50 bg-yellow-500/10">
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <AlertDescription className="text-sm pr-6">
          Para receber notificações, atualize seu iPhone para iOS 16.4 ou superior.
        </AlertDescription>
        <button onClick={() => setShow(false)} className="absolute top-3 right-3">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </Alert>
    </div>
  );
}
