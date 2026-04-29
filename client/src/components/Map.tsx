import { useEffect, useState, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, LayersControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { Issue } from "@shared/types";
import "leaflet.heat";
import { Search, MapPin, Navigation, Crosshair, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

// Fix for default marker icons in Leaflet with Webpack/Vite
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons for different statuses
const createStatusIcon = (color: string) => {
  return new L.DivIcon({
    className: "custom-marker",
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
};

const statusIcons = {
  open: createStatusIcon("#3b82f6"), // blue
  "in-progress": createStatusIcon("#f59e0b"), // amber
  resolved: createStatusIcon("#10b981"), // green
  default: createStatusIcon("#6b7280"), // gray
};

interface MapEventsProps {
  onLocationSelect?: (location: { lat: number; lng: number }) => void;
  onMapReady?: (map: L.Map) => void;
  onLocationFound?: (lat: number, lng: number) => void;
}

function MapResizer() {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    const intervals = [100, 500, 1000, 2000];
    const timers = intervals.map(ms => setTimeout(() => map.invalidateSize(), ms));
    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);
    return () => {
      timers.forEach(t => clearTimeout(t));
      resizeObserver.disconnect();
    };
  }, [map]);
  return null;
}

function MapEvents({ onLocationSelect, onMapReady, onLocationFound }: MapEventsProps) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    if (onMapReady) onMapReady(map);
    
    if (!(window as any)._hasAutoLocated) {
      (window as any)._hasAutoLocated = true;
      setTimeout(() => {
        map.locate({ setView: true, maxZoom: 15 });
      }, 500);
    }
  }, [map, onMapReady]);

  useMapEvents({
    click(e) {
      if (onLocationSelect) {
        onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
    locationfound(e) {
      if (onLocationFound) {
        onLocationFound(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

function HeatmapLayer({ issues, isVisible }: { issues: Issue[], isVisible: boolean }) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!isVisible) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    const points = issues.map(issue => [
      parseFloat(issue.latitude),
      parseFloat(issue.longitude),
      1
    ]);

    if (points.length > 0) {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
      // @ts-ignore
      heatLayerRef.current = L.heatLayer(points, {
        radius: 25, blur: 15, maxZoom: 15, max: 1.0,
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
      }).addTo(map);
    }

    return () => {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
    };
  }, [map, issues, isVisible]);

  return null;
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!hasRun.current) {
      map.setView(center, zoom);
      hasRun.current = true;
    }
  }, [center, zoom, map]);

  return null;
}

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: any) => void;
  onLocationSelect?: (location: { lat: number; lng: number }) => void;
  onLocationFound?: (lat: number, lng: number) => void;
  issues?: Issue[];
  selectedLocation?: { lat: number; lng: number } | null;
  onIssueClick?: (issue: Issue) => void;
  showHeatmap?: boolean;
}

export function MapView({
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
}: MapViewProps) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const utils = trpc.useUtils();

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await utils.client.maps.forwardGeocode.query({ query: searchQuery });
      setSearchResults(results);
      if (results.length > 0 && mapInstance) {
        mapInstance.setView([results[0].lat, results[0].lng], 16);
        if (onLocationSelect) {
          onLocationSelect({ lat: results[0].lat, lng: results[0].lng });
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLocate = () => {
    if (mapInstance) {
      mapInstance.locate({ setView: true, maxZoom: 16 });
    }
  };

  const markerHandlers = useMemo(
    () => ({
      dragend(e: any) {
        const marker = e.target;
        const position = marker.getLatLng();
        if (onLocationSelect) {
          onLocationSelect({ lat: position.lat, lng: position.lng });
        }
      },
    }),
    [onLocationSelect]
  );

  return (
    <div className={cn("w-full h-[500px] rounded-2xl overflow-hidden border border-slate-200 shadow-xl relative group", className)}>
      {/* Search Bar Overlay */}
      <div className="absolute top-4 left-4 right-16 z-[1000] max-w-md">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location..."
              className="pl-10 bg-white/95 backdrop-blur-md border-slate-200 shadow-lg focus:ring-blue-500 h-11 rounded-xl"
            />
          </div>
          <Button 
            type="submit" 
            disabled={isSearching}
            className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </form>
        
        {/* Search Results Dropdown */}
        {searchResults.length > 0 && searchQuery && (
          <div className="mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto divide-y divide-slate-50 animate-in fade-in slide-in-from-top-2">
            {searchResults.map((res, i) => (
              <button
                key={i}
                onClick={() => {
                  if (mapInstance) mapInstance.setView([res.lat, res.lng], 16);
                  if (onLocationSelect) onLocationSelect({ lat: res.lat, lng: res.lng });
                  setSearchResults([]);
                  setSearchQuery(res.display_name);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors text-sm text-slate-700 flex items-start gap-3"
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
          className="bg-white/95 backdrop-blur-md shadow-lg hover:bg-slate-50 h-11 w-11 rounded-xl border-slate-200 group/locate"
          title="My Location"
        >
          <Crosshair className="h-5 w-5 text-blue-600 group-hover/locate:scale-110 transition-transform" />
        </Button>
      </div>

      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={initialZoom}
        className="w-full h-full"
        zoomControl={false}
      >
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="Street View">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite View">
            <TileLayer
              attribution='Tiles &copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        <MapEvents 
          onLocationSelect={onLocationSelect} 
          onLocationFound={(lat, lng) => {
            setUserLocation({ lat, lng });
            if (onLocationFound) onLocationFound(lat, lng);
          }}
          onMapReady={(map) => {
            setMapInstance(map);
            if (onMapReady) onMapReady(map);
          }} 
        />

        <MapResizer />
        <MapUpdater center={[initialCenter.lat, initialCenter.lng]} zoom={initialZoom} />

        {/* User's position */}
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {/* Issue markers */}
        {issues.map((issue) => (
          <Marker
            key={issue.id}
            position={[parseFloat(issue.latitude), parseFloat(issue.longitude)]}
            icon={statusIcons[issue.status as keyof typeof statusIcons] || statusIcons.default}
            eventHandlers={{
              click: () => {
                if (onIssueClick) onIssueClick(issue);
              },
            }}
          >
            <Popup className="rounded-xl overflow-hidden">
              <div className="p-2 min-w-[150px]">
                <h3 className="font-bold text-sm text-slate-900">{issue.title}</h3>
                <p className="text-xs text-slate-600 mt-1">{issue.category}</p>
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <Button size="sm" className="w-full h-7 text-[10px]" onClick={() => onIssueClick?.(issue)}>
                    View Details
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <HeatmapLayer issues={issues} isVisible={showHeatmap} />

        {/* Selection marker - Draggable! */}
        {selectedLocation && (
          <Marker 
            position={[selectedLocation.lat, selectedLocation.lng]} 
            icon={DefaultIcon}
            draggable={true}
            eventHandlers={markerHandlers}
          >
            <Popup autoPan={false}>
              <p className="text-xs font-medium">Drag to refine location</p>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
