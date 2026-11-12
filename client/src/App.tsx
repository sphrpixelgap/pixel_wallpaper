import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import SiteLayout from "@/components/SiteLayout";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Admin = lazy(() => import("@/pages/Admin"));
const Favorites = lazy(() => import("@/pages/Favorites"));
const WallpaperDetail = lazy(() => import("@/pages/WallpaperDetail"));
const Games = lazy(() => import("@/pages/Games"));
const RequestWallpaper = lazy(() => import("@/pages/RequestWallpaper"));
const SubmitWallpaper = lazy(() => import("@/pages/SubmitWallpaper"));
const TrackRequest = lazy(() => import("@/pages/TrackRequest"));
const CollectionDetail = lazy(() => import("@/pages/Collections").then(module => ({ default: module.CollectionDetail })));
const CollectionsIndex = lazy(() => import("@/pages/Collections").then(module => ({ default: module.CollectionsIndex })));

function Router() {
  return (
    <SiteLayout>
      <Suspense fallback={<div className="route-loading" role="status" aria-live="polite"><span className="spinner" /> در حال آماده‌سازی صفحه...</div>}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/wallpapers/:id" component={WallpaperDetail} />
          <Route path="/games/:slug" component={Games} />
          <Route path="/collections/:slug" component={CollectionDetail} />
          <Route path="/collections" component={CollectionsIndex} />
          <Route path="/favorites" component={Favorites} />
          <Route path="/request" component={RequestWallpaper} />
          <Route path="/submit-wallpaper" component={SubmitWallpaper} />
          <Route path="/request/track" component={TrackRequest} />
          <Route path="/admin/admin" component={Admin} />
          <Route path="/admin"><Redirect to="/admin/admin" /></Route>
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </SiteLayout>
  );
}

export default function App() {
  useEffect(() => {
    document.getElementById("seo-fallback")?.remove();
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
