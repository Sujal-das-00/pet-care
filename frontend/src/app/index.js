import { Redirect } from 'expo-router';
import { useAuth } from '../state/AuthContext';

// "/" is always reachable; send people to wherever their session state says they belong.
export default function Index() {
  const { signedIn, onboardingDone } = useAuth();
  if (!signedIn) return <Redirect href="/welcome" />;
  return <Redirect href={onboardingDone ? '/home' : '/onboarding'} />;
}
