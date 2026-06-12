import { PowerProvider } from "./providers/power-provider"
import { ThemeProvider } from "@/providers/theme-provider"
import { SonnerProvider } from "@/providers/sonner-provider"
import { QueryProvider } from "./providers/query-provider"
import { RouterProvider } from "react-router-dom"
import { router } from "@/router"
import { CODEAPPS_THEME_STORAGE_KEY } from "@/config"

export default function App() {
  return (
    <PowerProvider>
      <ThemeProvider storageKey={CODEAPPS_THEME_STORAGE_KEY}>
        <SonnerProvider>
          <QueryProvider>
            <RouterProvider router={router} />
          </QueryProvider>
        </SonnerProvider>
      </ThemeProvider>
    </PowerProvider>
  )
}