import { Tabs } from 'expo-router';
import TabBar from '../../components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="activities" />
      <Tabs.Screen name="pet" />
    </Tabs>
  );
}
