import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeTable(tableName: string, queryKeys: string[][]) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`${tableName}-realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tableName },
        () => {
          queryKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, qc]);
}
