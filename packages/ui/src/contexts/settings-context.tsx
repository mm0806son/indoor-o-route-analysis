"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface SettingsContextType {
  // Storage Persistence Setting
  persistToDB: boolean;
  setPersistToDB: (value: boolean) => void;

  // Running Speed for Analysis (m/s)
  runningSpeed: number;
  setRunningSpeed: (value: number) => void;

  // Route Analysis k value (max alternative routes)
  routeAnalysisK: number;
  setRouteAnalysisK: (value: number) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

// Local storage keys
const STORAGE_KEYS = {
  PERSIST_DB: "app-persist-db",
  RUNNING_SPEED: "app-running-speed",
  ROUTE_ANALYSIS_K: "app-route-analysis-k",
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Persistence setting
  const [persistToDB, setPersistToDBState] = useState(true);
  // Running speed (m/s), default approx 6 min/km (2.78 m/s) -> let's use 3.33 m/s (5 min/km) as default or simply 3.0
  const [runningSpeed, setRunningSpeedState] = useState(3.0);
  // Route analysis k value (max alternative routes per leg)
  const [routeAnalysisK, setRouteAnalysisKState] = useState(6);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PERSIST_DB);
    if (saved !== null) {
      setPersistToDBState(saved === "true");
    }
    const savedSpeed = localStorage.getItem(STORAGE_KEYS.RUNNING_SPEED);
    if (savedSpeed !== null) {
      const parsed = parseFloat(savedSpeed);
      if (!isNaN(parsed) && parsed > 0) {
        setRunningSpeedState(parsed);
      }
    }
    const savedK = localStorage.getItem(STORAGE_KEYS.ROUTE_ANALYSIS_K);
    if (savedK !== null) {
      const parsed = parseInt(savedK, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 1000) {
        setRouteAnalysisKState(parsed);
      }
    }
  }, []);

  const setPersistToDB = useCallback((value: boolean) => {
    setPersistToDBState(value);
    localStorage.setItem(STORAGE_KEYS.PERSIST_DB, String(value));
  }, []);

  const setRunningSpeed = useCallback((value: number) => {
    setRunningSpeedState(value);
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, String(value));
  }, []);

  const setRouteAnalysisK = useCallback((value: number) => {
    setRouteAnalysisKState(value);
    localStorage.setItem(STORAGE_KEYS.ROUTE_ANALYSIS_K, String(value));
  }, []);

  const value: SettingsContextType = {
    persistToDB,
    setPersistToDB,

    runningSpeed,
    setRunningSpeed,

    routeAnalysisK,
    setRouteAnalysisK,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider")
  }
  return context
}
