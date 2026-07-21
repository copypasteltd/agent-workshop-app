import { MobileAuthScreen } from "../../components/MobileAuthScreen";
import { useMobileShareDisabled } from "../../lib/mobileShare";

export default function AuthPage() {
  useMobileShareDisabled();
  return <MobileAuthScreen />;
}
