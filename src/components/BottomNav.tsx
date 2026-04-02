import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Calendar, Users, CreditCard, Dumbbell } from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Painel" },
  { path: "/calendar", icon: Calendar, label: "Agenda" },
  { path: "/clients", icon: Users, label: "Alunos" },
  { path: "/plans", icon: Dumbbell, label: "Planos" },
  { path: "/payments", icon: CreditCard, label: "Pagamentos" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "drop-shadow-[0_0_6px_hsl(160,84%,39%)]" : ""}`} />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}