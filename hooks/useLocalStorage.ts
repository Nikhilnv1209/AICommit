"use client";

import { useState, useEffect } from "react";

/**
 * Custom hook to store and retrieve data from localStorage.
 * Works in Next.js App Router with SSR safety.
 */
function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store current value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue; // Prevent SSR errors

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error("Error reading from localStorage", error);
      return initialValue;
    }
  });

  // Function to update localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error("Error saving to localStorage", error);
    }
  };

  // Sync state across multiple tabs
  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === key) {
        setStoredValue(event.newValue ? JSON.parse(event.newValue) : initialValue);
      }
    };

    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, [key, initialValue]);

  return [storedValue, setValue] as const;
}

export default useLocalStorage;
