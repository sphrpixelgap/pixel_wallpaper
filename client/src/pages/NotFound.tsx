import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const NOT_FOUND_PATH = "/404";

export default function NotFound() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    if (window.location.pathname.replace(/\/$/, "") !== NOT_FOUND_PATH) window.location.replace(NOT_FOUND_PATH);
    return () => robots.remove();
  }, []);
  return (
    <main className="page-wrap" style={{ paddingTop: 70 }}>
      <Card className="not-found-card"><CardContent className="pt-8 pb-8 text-center">
        <AlertCircle className="not-found-icon" />
        <h1>۴۰۴</h1><h2>این مرحله پیدا نشد!</h2><p>صفحه‌ای که دنبالش هستی وجود ندارد یا جابه‌جا شده است.</p>
        <Button onClick={() => setLocation("/")} className="button-primary"><Home size={16} /> بازگشت به خانه</Button>
      </CardContent></Card>
    </main>
  );
}
