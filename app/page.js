import AuthGate from "../components/AuthGate";
import BarakahBoard from "../components/BarakahBoard";

export default function Page() {
  return (
    <AuthGate>
      <BarakahBoard />
    </AuthGate>
  );
}
