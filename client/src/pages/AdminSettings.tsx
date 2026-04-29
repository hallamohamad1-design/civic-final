import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Globe, Shield, Moon, Loader2, ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link, useLocation } from "wouter";

export default function AdminSettings() {
  const { user, loading: authLoading } = useAuth();
  const { theme: currentTheme, setTheme: applyTheme } = useTheme();
  const { language: currentLang, setLanguage: applyLanguage, t } = useLanguage();
  const [, navigate] = useLocation();
  
  const [language, setLanguage] = useState(currentLang);
  const [theme, setTheme] = useState(currentTheme);
  const [notifications, setNotifications] = useState({
    statusChanges: true,
    newComments: true,
    emailDigest: true,
  });

  const isAdmin = !!user && user.role === "admin";

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate, isAdmin]);

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      applyTheme(theme as "light" | "dark");
      applyLanguage(language);
      toast.success("Admin settings updated successfully!");
    },
    onError: (err) => {
      toast.error(`Failed to save admin settings: ${err.message}`);
    }
  });

  useEffect(() => {
    if (user) {
      if ((user as any).language) setLanguage((user as any).language);
      if ((user as any).theme) setTheme((user as any).theme);
      if ((user as any).notificationSettings) {
        try {
          const parsed = JSON.parse((user as any).notificationSettings);
          setNotifications(parsed);
        } catch (e) {
          console.error("Failed to parse admin notification settings", e);
        }
      }
    }
  }, [user]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      language,
      theme,
      notificationSettings: JSON.stringify(notifications)
    });
  };

  const handleThemeToggle = (isDark: boolean) => {
    const newTheme = isDark ? "dark" : "light";
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      {/* Admin Settings Header */}
      <div className="bg-slate-900 text-white shadow-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin-dashboard">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="h-6 w-px bg-slate-700 mx-2" />
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              <span className="font-bold text-lg tracking-tight">Admin Settings</span>
            </div>
          </div>
          <div className="text-sm font-medium text-slate-400">
            {user.name} (Super Admin)
          </div>
        </div>
      </div>

      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">System Preferences</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2">Manage your administrative experience and interface settings.</p>
            </div>
            {updateSettings.isPending && (
              <div className="flex items-center gap-2 text-primary text-sm animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Changes...
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Sidebar Navigation */}
            <div className="space-y-2">
              <Button variant="ghost" className="w-full justify-start gap-3 bg-white dark:bg-slate-800 shadow-sm font-semibold text-primary">
                <SettingsIcon className="h-5 w-5" /> Interface
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 dark:text-slate-300">
                <Bell className="h-5 w-5" /> Notifications
              </Button>
              <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 dark:text-slate-300">
                <Shield className="h-5 w-5" /> Security
              </Button>
            </div>

            {/* Main Settings Content */}
            <div className="md:col-span-2 space-y-6">
              {/* Language Selection */}
              <Card className="border-none shadow-sm dark:bg-slate-800 border-2 border-primary/5">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                      <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg dark:text-white">Language & Localization</CardTitle>
                      <CardDescription>Set your preferred language for the admin interface.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="language" className="dark:text-slate-200">System Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger id="language" className="w-full dark:bg-slate-700 dark:border-slate-600">
                        <SelectValue placeholder="Select Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English (US)</SelectItem>
                        <SelectItem value="ar">العربية (Arabic)</SelectItem>
                        <SelectItem value="fr">Français (French)</SelectItem>
                        <SelectItem value="es">Español (Spanish)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Notification Preferences */}
              <Card className="border-none shadow-sm dark:bg-slate-800">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-100 dark:bg-amber-900 p-2 rounded-lg">
                      <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg dark:text-white">Administrative Alerts</CardTitle>
                      <CardDescription>Manage how you receive updates about reported issues.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base dark:text-white">High Severity Alerts</Label>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Receive instant notifications for high severity reports.</p>
                    </div>
                    <Switch 
                      checked={notifications.statusChanges} 
                      onCheckedChange={(val) => setNotifications({...notifications, statusChanges: val})} 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base dark:text-white">Email Summary</Label>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Receive a daily digest of all civic activity.</p>
                    </div>
                    <Switch 
                      checked={notifications.emailDigest} 
                      onCheckedChange={(val) => setNotifications({...notifications, emailDigest: val})} 
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Theme / Appearance */}
              <Card className="border-none shadow-sm dark:bg-slate-800">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-lg">
                      <Moon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg dark:text-white">Interface Theme</CardTitle>
                      <CardDescription>Switch between light and dark mode for better visibility.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base dark:text-white">Dark Mode</Label>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Reduce eye strain during night shifts.</p>
                    </div>
                    <Switch 
                      checked={theme === "dark"} 
                      onCheckedChange={handleThemeToggle} 
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 pt-4">
                <Link href="/admin-dashboard">
                  <Button variant="outline" className="dark:bg-slate-700 dark:text-white dark:border-slate-600">Cancel</Button>
                </Link>
                <Button onClick={handleSave} disabled={updateSettings.isPending}>
                  {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Admin Preferences
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
