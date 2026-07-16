import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Globe, User, Shield, Moon, Loader2, Lock, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type Tab = "account" | "notifications" | "appearance" | "privacy";

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const { theme: currentTheme, setTheme: applyTheme } = useTheme();
  const { language: currentLang, setLanguage: applyLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const [language, setLanguage] = useState(currentLang);
  const [theme, setTheme] = useState(currentTheme);
  const { permission, requestPermission } = usePushNotifications();
  const [notifications, setNotifications] = useState({
    statusChanges: true,
    newComments: true,
    emailDigest: true,
    browserPush: permission === "granted",
  });

  // Privacy & Security state
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      applyTheme(theme as "light" | "dark");
      toast.success("Settings saved successfully!");
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  useEffect(() => {
    if (user) {
      if ((user as any).language) {
        setLanguage((user as any).language);
        applyLanguage((user as any).language);
      }
      if ((user as any).theme) {
        setTheme((user as any).theme);
        const storedTheme = localStorage.getItem("civicpulse-theme");
        if (!storedTheme) applyTheme((user as any).theme);
      }
      if ((user as any).notificationSettings) {
        try {
          const parsed = JSON.parse((user as any).notificationSettings);
          setNotifications(parsed);
        } catch {}
      }
    }
  }, [user]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      language,
      theme,
      notificationSettings: JSON.stringify(notifications),
    });
    applyLanguage(language);
  };

  const handleThemeToggle = (isDark: boolean) => {
    const newTheme = isDark ? "dark" : "light";
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const handleChangePassword = () => {
    if (!currentPassword) { toast.error("Please enter your current password."); return; }
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    // TODO: wire to tRPC changePassword procedure when added
    toast.success("Password change request submitted. (Backend not yet wired — add auth.changePassword procedure)");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
  };

  const sidebarItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "account",       label: t("settings.account"),       icon: <User className="h-5 w-5" /> },
    { id: "notifications", label: t("settings.notifications"),  icon: <Bell className="h-5 w-5" /> },
    { id: "appearance",    label: t("settings.appearance"),     icon: <Globe className="h-5 w-5" /> },
    { id: "privacy",       label: t("settings.privacy"),        icon: <Shield className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
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
          <div className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left
                  ${activeTab === item.id
                    ? "bg-primary text-white shadow-md shadow-primary/30"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {/* Main Content — only the active section */}
          <div className="md:col-span-2 space-y-6">

            {/* ── ACCOUNT ─────────────────────────────── */}
            {activeTab === "account" && (
              <>
                <Card className="border-none shadow-sm dark:bg-slate-800">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                        <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg dark:text-white">Language &amp; Region</CardTitle>
                        <CardDescription>Choose your preferred language for the interface</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="language" className="dark:text-slate-200">{t("settings.languageLabel")}</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger id="language" className="w-full dark:bg-slate-700 dark:border-slate-600 dark:text-white">
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

                <div className="flex justify-end gap-4 pt-2">
                  <Button variant="outline" className="dark:bg-slate-700 dark:text-white dark:border-slate-600" onClick={() => setLanguage(currentLang)}>
                    {t("settings.cancel")}
                  </Button>
                  <Button onClick={handleSave} disabled={updateSettings.isPending}>
                    {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("settings.save")}
                  </Button>
                </div>
              </>
            )}

            {/* ── NOTIFICATIONS ───────────────────────── */}
            {activeTab === "notifications" && (
              <>
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
                    {[
                      { key: "statusChanges" as const, label: t("settings.statusUpdates"),    desc: t("settings.statusUpdatesDesc") },
                      { key: "newComments"   as const, label: t("settings.comments"),          desc: t("settings.commentsDesc") },
                      { key: "emailDigest"   as const, label: t("settings.emailDigest"),       desc: t("settings.emailDigestDesc") },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base dark:text-white">{label}</Label>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{desc}</p>
                        </div>
                        <Switch
                          checked={notifications[key]}
                          onCheckedChange={(val) => setNotifications({ ...notifications, [key]: val })}
                        />
                      </div>
                    ))}

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-white">Browser Push Notifications</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Receive desktop alerts when you are away</p>
                      </div>
                      <Switch
                        checked={notifications.browserPush}
                        onCheckedChange={async (val) => {
                          if (val && permission !== "granted") {
                            const granted = await requestPermission();
                            if (granted) setNotifications({ ...notifications, browserPush: true });
                          } else {
                            setNotifications({ ...notifications, browserPush: val });
                          }
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-4 pt-2">
                  <Button variant="outline" className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                    {t("settings.cancel")}
                  </Button>
                  <Button onClick={handleSave} disabled={updateSettings.isPending}>
                    {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("settings.save")}
                  </Button>
                </div>
              </>
            )}

            {/* ── APPEARANCE ──────────────────────────── */}
            {activeTab === "appearance" && (
              <>
                <Card className="border-none shadow-sm dark:bg-slate-800">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-lg">
                        <Moon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg dark:text-white">{t("settings.appearance")}</CardTitle>
                        <CardDescription>Customize how CivicPulse looks on your device</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Dark Mode */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                      <div className="space-y-0.5">
                        <Label className="text-base dark:text-white">{t("settings.darkMode")}</Label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.darkModeDesc")}</p>
                      </div>
                      <Switch checked={theme === "dark"} onCheckedChange={handleThemeToggle} />
                    </div>

                    {/* Theme preview */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleThemeToggle(false)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          theme === "light" ? "border-primary" : "border-slate-200 dark:border-slate-600"
                        }`}
                      >
                        <div className="h-16 rounded-lg bg-white border border-slate-200 mb-2 flex items-center justify-center">
                          <div className="w-8 h-2 bg-slate-200 rounded" />
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Light</p>
                        {theme === "light" && <p className="text-[10px] text-primary font-bold">Active</p>}
                      </button>
                      <button
                        onClick={() => handleThemeToggle(true)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          theme === "dark" ? "border-primary" : "border-slate-200 dark:border-slate-600"
                        }`}
                      >
                        <div className="h-16 rounded-lg bg-slate-900 border border-slate-700 mb-2 flex items-center justify-center">
                          <div className="w-8 h-2 bg-slate-600 rounded" />
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Dark</p>
                        {theme === "dark" && <p className="text-[10px] text-primary font-bold">Active</p>}
                      </button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-4 pt-2">
                  <Button variant="outline" className="dark:bg-slate-700 dark:text-white dark:border-slate-600">
                    {t("settings.cancel")}
                  </Button>
                  <Button onClick={handleSave} disabled={updateSettings.isPending}>
                    {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("settings.save")}
                  </Button>
                </div>
              </>
            )}

            {/* ── PRIVACY & SECURITY ──────────────────── */}
            {activeTab === "privacy" && (
              <>
                {/* Change Password */}
                <Card className="border-none shadow-sm dark:bg-slate-800">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg">
                        <Lock className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg dark:text-white">Change Password</CardTitle>
                        <CardDescription>Update your account password. Use a strong password of at least 8 characters.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { id: "current", label: "Current Password", value: currentPassword, set: setCurrentPassword, show: showCurrentPw, toggle: () => setShowCurrentPw(p => !p) },
                      { id: "new",     label: "New Password",     value: newPassword,     set: setNewPassword,     show: showNewPw,     toggle: () => setShowNewPw(p => !p) },
                      { id: "confirm", label: "Confirm New Password", value: confirmPassword, set: setConfirmPassword, show: showConfirmPw, toggle: () => setShowConfirmPw(p => !p) },
                    ].map(({ id, label, value, set, show, toggle }) => (
                      <div key={id} className="space-y-1">
                        <Label className="dark:text-slate-200">{label}</Label>
                        <div className="relative">
                          <Input
                            type={show ? "text" : "password"}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            className="pr-10 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={toggle}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {id === "confirm" && confirmPassword && newPassword !== confirmPassword && (
                          <p className="text-xs text-red-500">Passwords do not match</p>
                        )}
                      </div>
                    ))}
                    <Button
                      onClick={handleChangePassword}
                      className="w-full mt-2"
                      disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                    >
                      Update Password
                    </Button>
                  </CardContent>
                </Card>

                {/* Active Sessions info */}
                <Card className="border-none shadow-sm dark:bg-slate-800">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-lg">
                        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg dark:text-white">Login &amp; Sessions</CardTitle>
                        <CardDescription>Manage where you're signed in</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Current Session</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {user?.email} · Active now
                        </p>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Delete Account — danger zone */}
                <Card className="border-none shadow-sm border border-red-100 dark:border-red-900/40 dark:bg-slate-800">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-red-100 dark:bg-red-900 p-2 rounded-lg">
                        <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-red-600 dark:text-red-400">Delete Account</CardTitle>
                        <CardDescription>Permanently delete your account and all your data. This cannot be undone.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Type <span className="font-mono font-bold text-red-500">DELETE</span> to confirm:
                    </p>
                    <Input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    />
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={deleteConfirmText !== "DELETE"}
                      onClick={() => toast.error("Account deletion requires contacting support. This action is irreversible.")}
                    >
                      Permanently Delete Account
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
