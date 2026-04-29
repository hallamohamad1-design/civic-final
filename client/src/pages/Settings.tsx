import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Globe, User, Shield, Moon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const { theme: currentTheme, setTheme: applyTheme } = useTheme();
  const { language: currentLang, setLanguage: applyLanguage, t } = useLanguage();
  const [language, setLanguage] = useState(currentLang);
  const [theme, setTheme] = useState(currentTheme);
  const { permission, requestPermission } = usePushNotifications();
  const [notifications, setNotifications] = useState({
    statusChanges: true,
    newComments: true,
    emailDigest: true,
    browserPush: permission === 'granted'
  });

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      // Apply theme change immediately across the whole app
      applyTheme(theme as "light" | "dark");
      toast.success("Settings saved successfully!");
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    }
  });

  // Initialize from user data
  useEffect(() => {
    if (user) {
      if ((user as any).language) {
        setLanguage((user as any).language);
        applyLanguage((user as any).language);
      }
      if ((user as any).theme) {
        setTheme((user as any).theme);
        applyTheme((user as any).theme);
      }
      if ((user as any).notificationSettings) {
        try {
          const parsed = JSON.parse((user as any).notificationSettings);
          setNotifications(parsed);
        } catch (e) {
          console.error("Failed to parse notification settings", e);
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
    applyLanguage(language);
  };

  // Apply theme immediately on toggle (before save)
  const handleThemeToggle = (isDark: boolean) => {
    const newTheme = isDark ? "dark" : "light";
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t("settings.title")}</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">{t("settings.desc")}</p>
          </div>
          {authLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing...
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Sidebar Navigation */}
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start gap-3 bg-white dark:bg-slate-800 shadow-sm font-semibold text-primary">
              <User className="h-5 w-5" /> {t("settings.account")}
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 dark:text-slate-300">
              <Bell className="h-5 w-5" /> {t("settings.notifications")}
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 dark:text-slate-300">
              <Globe className="h-5 w-5" /> {t("settings.appearance")}
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 dark:text-slate-300">
              <Shield className="h-5 w-5" /> {t("settings.privacy")}
            </Button>
          </div>

          {/* Main Settings Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Language Selection */}
            <Card className="border-none shadow-sm dark:bg-slate-800">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                    <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg dark:text-white">{t("settings.language")}</CardTitle>
                    <CardDescription>{t("settings.languageDesc")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language" className="dark:text-slate-200">{t("settings.languageLabel")}</Label>
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
                    <CardTitle className="text-lg dark:text-white">{t("settings.notifTitle")}</CardTitle>
                    <CardDescription>{t("settings.notifDesc")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base dark:text-white">{t("settings.statusUpdates")}</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.statusUpdatesDesc")}</p>
                  </div>
                  <Switch 
                    checked={notifications.statusChanges} 
                    onCheckedChange={(val) => setNotifications({...notifications, statusChanges: val})} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base dark:text-white">{t("settings.comments")}</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.commentsDesc")}</p>
                  </div>
                  <Switch 
                    checked={notifications.newComments} 
                    onCheckedChange={(val) => setNotifications({...notifications, newComments: val})} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base dark:text-white">{t("settings.emailDigest")}</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.emailDigestDesc")}</p>
                  </div>
                  <Switch 
                    checked={notifications.emailDigest} 
                    onCheckedChange={(val) => setNotifications({...notifications, emailDigest: val})} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base dark:text-white">Browser Push Notifications</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Receive desktop alerts when you are away</p>
                  </div>
                  <Switch 
                    checked={notifications.browserPush} 
                    onCheckedChange={async (val) => {
                      if (val && permission !== 'granted') {
                        const granted = await requestPermission();
                        if (granted) setNotifications({...notifications, browserPush: true});
                      } else {
                        setNotifications({...notifications, browserPush: val});
                      }
                    }} 
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
                    <CardTitle className="text-lg dark:text-white">{t("settings.appearance")}</CardTitle>
                    <CardDescription>{t("settings.darkModeDesc")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base dark:text-white">{t("settings.darkMode")}</Label>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.darkModeDesc")}</p>
                  </div>
                  <Switch 
                    checked={theme === "dark"} 
                    onCheckedChange={handleThemeToggle} 
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 pt-4">
              <Button variant="outline" className="dark:bg-slate-700 dark:text-white dark:border-slate-600">{t("settings.cancel")}</Button>
              <Button onClick={handleSave} disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("settings.save")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
