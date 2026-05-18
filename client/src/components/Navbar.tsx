import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MapPin, Plus, LayoutDashboard, LogOut, Settings, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Navbar() {
  const { user, isAuthenticated, logout, loading } = useAuth();
  const [location] = useLocation();
  const { t } = useLanguage();

  const isActive = (path: string) => location === path;

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <span className="font-bold text-lg text-slate-900">CivicPulse</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            <Link href="/map">
              <Button
                variant={isActive("/map") ? "default" : "ghost"}
                className="gap-2"
              >
                <MapPin className="h-4 w-4" />
                {t("nav.map")}
              </Button>
            </Link>
            <Link href="/submit">
              <Button
                variant={isActive("/submit") ? "default" : "ghost"}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("nav.report")}
              </Button>
            </Link>
            {isAuthenticated && (
              <Link href="/dashboard">
                <Button
                  variant={isActive("/dashboard") ? "default" : "ghost"}
                  className="gap-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {t("nav.dashboard")}
                </Button>
              </Link>
            )}
            <Link href="/settings">
              <Button
                variant={isActive("/settings") ? "default" : "ghost"}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                {t("nav.settings")}
              </Button>
            </Link>
          </div>

          {/* Auth Section */}
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="h-10 w-10 bg-slate-200 rounded-full animate-pulse" />
            ) : isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-white text-sm font-bold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-semibold text-slate-900">{user.name || "User"}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      {t("nav.settings")}
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer font-bold text-primary">
                        <Shield className="h-4 w-4 mr-2" />
                        {t("nav.admin")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="text-red-600 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/signup">{t("nav.signup")}</Link>
                </Button>
                <Button asChild>
                  <a href={getLoginUrl()}>{t("nav.login")}</a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
