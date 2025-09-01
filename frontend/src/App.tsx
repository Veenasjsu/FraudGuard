import { Button } from "./components/ui/button";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900">
      <h1 className="text-3xl font-bold mb-6">🚀 FraudGuard Dashboard Starter</h1>
      <Button 
      type="button"
        className="px-6 py-3 text-base relative z-10"
        onClick={() => alert("Button works! 🎉")}
      >
        Click Me
      </Button>
    </div>
  );
}