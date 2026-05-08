import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapPin, AlertCircle, ArrowLeft, Plus, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const INITIAL_CENTER = { lat: 30.0444, lng: 31.2357 };
const INITIAL_ZOOM = 14;

export default function SubmitIssue() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const { sendNotification } = usePushNotifications();

  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Roads");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  // Ref to track the debounce timer so we can cancel it on each new keystroke
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI Risk Assessment Logic — debounced so it only fires 600ms after typing stops
  const assessRisk = (text: string) => {
    if (!text) return;

    // Cancel any pending timer from a previous keystroke
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);

    setIsAiAnalyzing(true);

    aiDebounceRef.current = setTimeout(() => {
      const lowerText = text.toLowerCase();

      const highRiskWords = ["fire", "explosion", "gas", "leak", "electricity", "collapsed", "blood", "hazard", "danger", "emergency", "fatal"];
      const mediumRiskWords = ["pothole", "broken", "noise", "dark", "trash", "smell", "flood", "crack"];

      if (highRiskWords.some(word => lowerText.includes(word))) {
        setSeverity("high");
      } else if (mediumRiskWords.some(word => lowerText.includes(word))) {
        setSeverity("medium");
      } else if (text.length > 5) {
        setSeverity("low");
      }
      setIsAiAnalyzing(false);
    }, 600); // 600ms debounce — waits for the user to pause typing
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDescription(text);
    // Trigger AI assessment with a slight debounce-like behavior
    assessRisk(text);
  };
  const utils = trpc.useUtils();
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(true);

  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const createIssueMutation = trpc.issues.create.useMutation();

  const categories = ["Roads", "Water", "Electricity", "Sanitation", "Other"] as const;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for resizing
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Ultra-conservative 640px to ensure it fits even in 64KB TEXT columns
        const MAX_WIDTH = 640;
        const MAX_HEIGHT = 640;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to quality-reduced JPEG Base64 (0.5 quality for maximum compatibility)
        const resizedBase64 = canvas.toDataURL("image/jpeg", 0.5);
        setImageUrl(resizedBase64);
        toast.success("Image processed and optimized!");
        setIsUploading(false);
      };
      img.onerror = () => {
        toast.error("Failed to process image");
        setIsUploading(false);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    setIsGeocoding(true);
    setAddress("Loading...");
    try {
      const data = await utils.client.maps.reverseGeocode.query({ lat, lng });
      setAddress(data.address);
    } catch (error) {
      console.error("Geocoding error:", error);
      setAddress("Unknown Location");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleLocationSelect = useCallback(async (location: { lat: number; lng: number }) => {
    setSelectedLocation(location);
    await reverseGeocode(location.lat, location.lng);
  }, []);

  const handleMapReady = useCallback((map: any) => {
    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          if (map.setView) {
            map.setView([userLocation.lat, userLocation.lng], 14);
          }
          
          // Auto-select user's location
          handleLocationSelect(userLocation);
        },
        (error) => {
          console.warn("Geolocation error:", error);
        }
      );
    }
  }, [handleLocationSelect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAuthenticated) {
      toast.error(t("nav.login"));
      return;
    }

    if (!selectedLocation) {
      toast.error(t("submit.selectLocationAlert"));
      return;
    }

    if (!title.trim()) {
      toast.error(t("submit.issueTitlePlaceholder"));
      return;
    }

    if (!description.trim()) {
      toast.error(t("submit.descPlaceholder"));
      return;
    }

    try {
      await createIssueMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        address: (address === "Loading..." ? "Location identified by coordinates" : (address.trim() || "Unknown Location")).substring(0, 500),
        latitude: selectedLocation.lat.toString(),
        longitude: selectedLocation.lng.toString(),
        imageUrl: imageUrl || undefined,
      });

      sendNotification("CivicPulse Issue Reported", {
        body: `Your issue "${title.trim()}" was submitted successfully. Thank you!`
      });

      // Invalidate caches so admin dashboard auto-refreshes
      utils.admin.invalidate();
      utils.issues.invalidate();

      toast.success(t("submit.success"));
      navigate("/map");
    } catch (error: any) {
      console.error("Failed to create issue:", error);
      toast.error(error.message || t("submit.fail"));
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header with Glassmorphism */}
      <div className="sticky top-0 z-[1001] bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/map")}
              className="rounded-full hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">{t("submit.title")}</h1>
              <p className="text-xs text-slate-500 font-medium">{t("submit.desc")}</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
            {t("submit.location")}
          </Badge>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Side: Map and Info */}
          <div className="lg:col-span-8 space-y-6">
            <Card className="border-none shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden ring-1 ring-slate-200">
              <CardContent className="p-0">
                <div className="relative h-[450px] lg:h-[calc(100vh-280px)] min-h-[400px]">
                  <MapView
                    className="w-full h-full"
                    initialCenter={INITIAL_CENTER}
                    initialZoom={INITIAL_ZOOM}
                    onMapReady={handleMapReady}
                    selectedLocation={selectedLocation}
                    onLocationSelect={handleLocationSelect}
                    onLocationFound={(lat, lng) => {
                      setIsDetectingLocation(false);
                      handleLocationSelect({ lat, lng });
                    }}
                  />
                  
                  {/* Floating Overlay for status */}
                  {!selectedLocation && isDetectingLocation && (
                    <div className="absolute inset-x-0 bottom-8 flex justify-center z-[1000] px-4">
                      <div className="bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                        <span className="text-sm font-medium">Detecting your location...</span>
                      </div>
                    </div>
                  )}
                  {!selectedLocation && !isDetectingLocation && (
                    <div className="absolute inset-x-0 bottom-8 flex justify-center z-[1000] px-4">
                      <div className="bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
                        <MapPin className="h-5 w-5 text-blue-400" />
                        <span className="text-sm font-medium">{t("submit.locationDesc")}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Address Information Card */}
            <div className={`transition-all duration-500 transform ${selectedLocation ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
              <Card className="border-none shadow-lg shadow-slate-200/40 rounded-2xl bg-gradient-to-br from-white to-slate-50 ring-1 ring-slate-200">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-200">
                      <MapPin className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900">{t("submit.location")}</h3>
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none">
                          Verified
                        </Badge>
                      </div>
                      <p className="text-slate-600 mt-2 text-sm leading-relaxed">{isGeocoding ? t("general.loading") : (address || t("submit.location"))}</p>
                      <div className="flex gap-4 mt-3 text-[10px] font-mono text-slate-400">
                        <span>LAT: {selectedLocation?.lat.toFixed(6)}</span>
                        <span>LNG: {selectedLocation?.lng.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Side: Form Details */}
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <Card className="border-none shadow-2xl shadow-slate-200/60 rounded-3xl bg-white ring-1 ring-slate-100 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500" />
              <CardContent className="p-8">
                <div className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900">{t("submit.title")}</h2>
                  <p className="text-slate-400 text-sm mt-1">{t("submit.desc")}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                      {t("submit.issueTitle")}
                    </label>
                    <Input
                      placeholder={t("submit.issueTitlePlaceholder")}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="rounded-xl border-slate-200 focus:ring-blue-500 h-12 transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                      {t("submit.category")}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl border-slate-200 focus:ring-blue-500 h-12 px-3 text-sm bg-white"
                      required
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{t(`submit.cat${cat}`)}</option>
                      ))}
                    </select>
                  </div>

                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                        Severity Level
                      </label>
                      {isAiAnalyzing ? (
                        <span className="text-[10px] text-blue-600 animate-pulse font-bold bg-blue-50 px-2 py-0.5 rounded-full">AI ANALYZING...</span>
                      ) : (
                        <Badge className="bg-blue-50 text-blue-600 hover:bg-blue-50 border-none text-[9px] font-bold">SMART SUGGESTION</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["low", "medium", "high"] as const).map((sev) => (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setSeverity(sev)}
                          className={`py-3 rounded-xl font-bold text-xs transition-all duration-300 border ${
                            severity === sev
                              ? sev === "low"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm"
                                : sev === "medium"
                                ? "bg-amber-50 border-amber-200 text-amber-700 shadow-sm"
                                : "bg-rose-50 border-rose-200 text-rose-700 shadow-sm"
                              : "bg-white border-slate-100 text-slate-400 hover:border-slate-300"
                          }`}
                        >
                          {sev.toUpperCase()}
                        </button>
                      ))}
                    </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                      Evidence Photo
                    </label>
                    <div className="flex flex-col gap-4">
                      {imageUrl ? (
                        <div className="relative group rounded-2xl overflow-hidden border-2 border-blue-100 aspect-video bg-slate-50">
                          <img 
                            src={imageUrl} 
                            alt="Preview" 
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                          />
                          <button
                            type="button"
                            onClick={() => setImageUrl("")}
                            className="absolute top-2 right-2 bg-white/90 backdrop-blur shadow-lg p-2 rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-all"
                          >
                            <AlertCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isUploading ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:bg-blue-50/30 hover:border-blue-300'}`}>
                          {isUploading ? (
                            <div className="flex flex-col items-center gap-2">
                              <div className="h-8 w-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                              <span className="text-xs font-bold text-slate-400">UPLOADING...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <Plus className="w-8 h-8 text-blue-500 mb-2" />
                              <p className="text-sm font-bold text-slate-600">Click to upload photo</p>
                              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">PNG, JPG or WEBP (MAX. 5MB)</p>
                            </div>
                          )}
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                      {t("submit.description")}
                    </label>
                    <Textarea
                      placeholder={t("submit.descPlaceholder")}
                      value={description}
                      onChange={handleDescriptionChange}
                      className="rounded-xl border-slate-200 focus:ring-blue-500 transition-all min-h-[120px] resize-none"
                      required
                    />
                  </div>

                  {!selectedLocation && (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex gap-4 animate-pulse">
                      <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-700 font-medium leading-relaxed">
                        The submit button will be enabled once you select a location on the map.
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-14 text-base font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    disabled={createIssueMutation.isPending || !selectedLocation}
                  >
                    {createIssueMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        {t("submit.submitting")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        {t("submit.button")}
                      </span>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
