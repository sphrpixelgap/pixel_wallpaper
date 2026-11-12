import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[UI] Unhandled client error", error.name);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main dir="rtl" role="alert" className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle size={48} className="text-destructive mb-6 flex-shrink-0" aria-hidden="true" />
            <h1 className="text-xl mb-4">بخشی از سایت با خطا روبه‌رو شد.</h1>
            <p className="text-center text-muted-foreground mb-6">جزئیات فنی نمایش داده نمی‌شود. می‌توانی صفحه را دوباره بارگذاری کنی.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} aria-hidden="true" />
              تلاش دوباره
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
