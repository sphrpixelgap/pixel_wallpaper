import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/NotFound";
import Admin from "@/pages/Admin";
import Favorites from "@/pages/Favorites";
import Home from "@/pages/Home";
import WallpaperDetail from "@/pages/WallpaperDetail";
import Games from "@/pages/Games";
import RequestWallpaper from "@/pages/RequestWallpaper";
import TrackRequest from "@/pages/TrackRequest";
import { CollectionDetail, CollectionsIndex } from "@/pages/Collections";
import SiteLayout from "@/components/SiteLayout";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <SiteLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/wallpapers/:id" component={WallpaperDetail} />
        <Route path="/games/:slug" component={Games} />
        <Route path="/collections/:slug" component={CollectionDetail} />
        <Route path="/collections" component={CollectionsIndex} />
        <Route path="/favorites" component={Favorites} />
        <Route path="/request" component={RequestWallpaper} />
        <Route path="/request/track" component={TrackRequest} />
        <Route path="/admin/admin" component={Admin} />
        <Route path="/admin"><Redirect to="/admin/admin" /></Route>
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
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
