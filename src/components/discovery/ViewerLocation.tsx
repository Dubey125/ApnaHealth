"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { formatDistanceKm, haversineDistanceKm, isValidCoordinates } from "@/lib/geo/distance";

// "How far is this from me?", answered without the server ever finding out.
//
// The /doctors radius search has to send a position, because the database
// does the filtering. These pages don't: the facility's coordinates are
// public and already on the page, so the browser can measure the distance
// itself. Nothing is sent, nothing is logged, nothing is stored — the
// position lives in React state and is gone when the page is.
//
// Usage: wrap a subtree in <ViewerLocationProvider>, put a
// <ShowDistancesButton /> somewhere in it, and drop <DistanceFromViewer />
// wherever a facility's coordinates are rendered. Server components can be
// children of the provider; only the leaves that read the position are
// client components.

interface ViewerLocationValue {
  origin: { latitude: number; longitude: number } | null;
  status: Status;
  request: () => void;
  clear: () => void;
}

type Status = "idle" | "locating" | "ready" | "denied" | "unavailable" | "unsupported";

const FAILURE_MESSAGES: Record<"denied" | "unavailable" | "unsupported", string> = {
  denied: "Location access is blocked for this site. You can allow it from your browser's address bar.",
  unavailable: "Your device could not determine a location right now.",
  unsupported: "This browser does not support location.",
};

const ViewerLocationContext = createContext<ViewerLocationValue | null>(null);

export function ViewerLocationProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<ViewerLocationValue["origin"]>(null);
  const [status, setStatus] = useState<Status>("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Read only after the browser confirms permission. Kept at full
        // precision because it never leaves this tab — the coarsening in
        // lib/geo/searchParams exists for the position that IS sent.
        setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus("ready");
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const clear = useCallback(() => {
    setOrigin(null);
    setStatus("idle");
  }, []);

  const value = useMemo<ViewerLocationValue>(
    () => ({ origin, status, request, clear }),
    [origin, status, request, clear],
  );

  return <ViewerLocationContext.Provider value={value}>{children}</ViewerLocationContext.Provider>;
}

function useViewerLocation(): ViewerLocationValue {
  const value = useContext(ViewerLocationContext);
  if (!value) {
    throw new Error("Wrap this subtree in <ViewerLocationProvider> before using viewer location.");
  }
  return value;
}

export function ShowDistancesButton({
  label = "Show distance from me",
  size = "sm",
}: {
  label?: string;
  size?: "sm" | "md";
}) {
  const { origin, status, request, clear } = useViewerLocation();

  if (origin) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Distances are from your current location.</span>
        <button type="button" onClick={clear} className="text-primary underline underline-offset-2">
          Hide
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="secondary" size={size} onClick={request} disabled={status === "locating"}>
        {status === "locating" ? "Finding you…" : label}
      </Button>
      {status !== "idle" && status !== "locating" && status !== "ready" && (
        <p role="status" className="text-xs text-muted">
          {FAILURE_MESSAGES[status]}
        </p>
      )}
    </div>
  );
}

/**
 * Renders "1.8 km away" once the viewer has shared a location, and nothing
 * at all before that or for a facility with no recorded coordinates — an
 * un-geocoded facility has no honest distance to show.
 */
export function DistanceFromViewer({
  latitude,
  longitude,
  className = "font-medium text-foreground",
}: {
  latitude: number | null;
  longitude: number | null;
  className?: string;
}) {
  const { origin } = useViewerLocation();
  const target = latitude === null || longitude === null ? null : { latitude, longitude };
  if (!origin || !isValidCoordinates(target)) return null;

  return <span className={className}>{formatDistanceKm(haversineDistanceKm(origin, target))} away</span>;
}
