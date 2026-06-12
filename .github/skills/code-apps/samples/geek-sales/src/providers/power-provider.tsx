import { useEffect, type ReactNode } from "react";
import { getContext } from "@microsoft/power-apps/app";

let initializedCalled = false;

type PowerProviderProps = { children: ReactNode };

export function PowerProvider({ children }: PowerProviderProps) {
  useEffect(() => {
    if (initializedCalled) return;
    initializedCalled = true;

    const initApp = async () => {
      try {
        await getContext();
        console.log("Power Apps SDK initialized successfully");
      } catch (error) {
        console.error("Power Apps SDK initialize failed: ", error);
      }
    };
    initApp();
  }, []);

  return <>{children}</>;
}
