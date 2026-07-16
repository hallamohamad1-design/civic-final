import React, { useEffect, useState, useRef, useCallback } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";
import type { Issue } from "@shared/types";
import { Search, MapPin, Crosshair, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface GoogleMapProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  onLocationSelect?: (location: { lat: number; lng: number }) => void;
  onLocationFound?: (lat: number, lng: number) => void;
  issues?: Issue[];
  selectedLocation?: { lat: number; lng: number } | null;
  onIssueClick?: (issue: Issue) => void;
  showHeatmap?: boolean;
}

function MapEvents({ 
  onLocationSelect, 
  onMapReady, 
  onLocationFound 
}: { 
  onLocationSelect?: (location: { lat: number; lng: number }) => void;
  onMapReady?: (map: google.maps.Map) => void;
  onLocationFound?: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (map && onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: any) => {
      if (e.latLng && onLocationSelect) {
        onLocationSelect({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    };

    const listener = map.addListener("click", handleClick);

    return () => {
      if (listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [map, onLocationSelect]);

  // Try to get user's location
  useEffect(() => {
    if (!map || !onLocationFound) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          map.setCenter(userLocation);
          map.setZoom(15);
          onLocationFound(userLocation.lat, userLocation.lng);
        },
        (error) => {
          console.warn("Geolocation error:", error);
        }
      );
    }
  }, [map, onLocationFound]);

  return null;
}

function MapView({
  className,
  initialCenter = { lat: 30.0444, lng: 31.2357 },
  initialZoom = 13,
  onMapReady,
  onLocationSelect,
  onLocationFound,
  issues = [],
  selectedLocation,
  onIssueClick,
  showHeatmap = false,
}: GoogleMapProps) {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLocating, setIsLocating] = useState(false);

  const utils = trpc.useUtils();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      console.log('[GoogleMap] Searching for:', searchQuery);
      const results = await utils.client.maps.forwardGeocode.query({ query: searchQuery });
      console.log('[GoogleMap] Search results:', results);
      setSearchResults(results);
      if (results.length > 0 && mapInstance) {
        mapInstance.setCenter({ lat: results[0].lat, lng: results[0].lng });
        mapInstance.setZoom(16);
        if (onLocationSelect) {
          onLocationSelect({ lat: results[0].lat, lng: results[0].lng });
        }
      } else {
        console.warn('[GoogleMap] No results found for:', searchQuery);
      }
    } catch (error) {
      console.error("[GoogleMap] Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLocate = useCallback(() => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          if (mapInstance) {
            mapInstance.setCenter(userLocation);
            mapInstance.setZoom(16);
          }
          setUserLocation(userLocation);
          if (onLocationFound) {
            onLocationFound(userLocation.lat, userLocation.lng);
          }
          setIsLocating(false);
        },
        (error) => {
          console.warn("Geolocation error:", error);
          setIsLocating(false);
        }
      );
    }
  }, [mapInstance, onLocationFound]);

  const handleMarkerDragEnd = useCallback((e: any) => {
    if (e.latLng && onLocationSelect) {
      onLocationSelect({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [onLocationSelect]);

  // Fallback when no API key is provided
  if (!apiKey) {
    return (
      <div className={cn("w-full h-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-xl relative bg-slate-100 dark:bg-slate-800 flex items-center justify-center", className)}>
        <div className="text-center p-8">
          <MapPin className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Google Maps API Key Required</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            To use Google Maps, please add your API key to the environment variables.
          </p>
          <div className="bg-slate-200 dark:bg-slate-700 rounded-lg p-4 text-left">
            <p className="text-xs font-mono text-slate-700 dark:text-slate-300 mb-2">
              Add to your .env file:
            </p>
            <code className="text-xs bg-slate-300 dark:bg-slate-600 px-2 py-1 rounded">
              VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
            </code>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-4">
            Get your API key from:{" "}
            <a 
              href="https://console.cloud.google.com/apis/credentials" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google Cloud Console
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full h-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-xl relative group bg-slate-100 dark:bg-slate-800", className)}>
      {/* Search Bar Overlay */}
      <div className="absolute top-4 left-4 right-16 z-[1000] max-w-md">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location..."
              className="pl-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-slate-200 dark:border-slate-600 shadow-lg focus:ring-blue-500 h-11 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <Button 
            type="submit" 
            disabled={isSearching}
            className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-blue-900/20"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>
        
        {/* Search Results Dropdown */}
        {searchResults.length > 0 && searchQuery && (
          <div className="mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 max-h-60 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700 animate-in fade-in slide-in-from-top-2">
            {searchResults.map((res, i) => (
              <button
                key={i}
                onClick={() => {
                  if (mapInstance) {
                    mapInstance.setCenter({ lat: res.lat, lng: res.lng });
                    mapInstance.setZoom(16);
                  }
                  if (onLocationSelect) onLocationSelect({ lat: res.lat, lng: res.lng });
                  setSearchResults([]);
                  setSearchQuery(res.display_name);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm text-slate-700 dark:text-slate-200 flex items-start gap-3"
              >
                <MapPin className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                <span>{res.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <Button 
          variant="outline"
          size="icon"
          onClick={handleLocate}
          disabled={isLocating}
          className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 h-11 w-11 rounded-xl border-slate-200 dark:border-slate-600"
          title="My Location"
        >
          {isLocating ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> : <Crosshair className="h-5 w-5 text-blue-600" />}
        </Button>
      </div>

      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={initialCenter}
          defaultZoom={initialZoom}
          mapId="DEMO_MAP_ID"
          className="w-full h-full"
          disableDefaultUI={false}
        >
          <MapEvents 
            onLocationSelect={onLocationSelect}
            onMapReady={(map) => {
              setMapInstance(map);
              if (onMapReady) onMapReady(map);
            }}
            onLocationFound={(lat, lng) => {
              setUserLocation({ lat, lng });
              if (onLocationFound) onLocationFound(lat, lng);
            }}
          />

          {/* User's position */}
          {userLocation && (
            <AdvancedMarker position={userLocation}>
              <Pin background="#3b82f6" borderColor="#1d4ed8" glyphColor="#ffffff" />
            </AdvancedMarker>
          )}

          {/* Issue markers */}
          {issues.map((issue) => (
            <AdvancedMarker
              key={issue.id}
              position={{ lat: parseFloat(issue.latitude), lng: parseFloat(issue.longitude) }}
              onClick={() => {
                if (onIssueClick) onIssueClick(issue);
              }}
            >
              <Pin 
                background={
                  issue.status === "open" ? "#3b82f6" :
                  issue.status === "in-progress" ? "#f59e0b" :
                  issue.status === "resolved" ? "#10b981" : "#6b7280"
                }
                borderColor="#ffffff"
                glyphColor="#ffffff"
              />
            </AdvancedMarker>
          ))}

          {/* Selection marker - Draggable! */}
          {selectedLocation && (
            <AdvancedMarker
              position={selectedLocation}
              draggable={true}
              onDragEnd={handleMarkerDragEnd}
            >
              <Pin background="#ef4444" borderColor="#b91c1c" glyphColor="#ffffff" />
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}

export function GoogleMap(props: GoogleMapProps) {
  return <MapView {...props} />;
}
