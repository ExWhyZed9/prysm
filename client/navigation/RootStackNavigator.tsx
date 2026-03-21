import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import SetupScreen from "@/screens/SetupScreen";
import PlayerScreen from "@/screens/PlayerScreen";
import NetworkStreamScreen from "@/screens/NetworkStreamScreen";
import NetworkPlayerScreen from "@/screens/NetworkPlayerScreen";
import { usePlaylist } from "@/context/PlaylistContext";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { NetworkStreamConfig } from "@/lib/storage";

export type RootStackParamList = {
  Setup: { fromSettings?: boolean } | undefined;
  Main: undefined;
  Player: { channelId: string };
  NetworkStream: undefined;
  NetworkPlayer: { config: NetworkStreamConfig };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const { isLoading } = usePlaylist();
  const screenOptions = useScreenOptions();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Setup"
        component={SetupScreen}
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "fade",
          autoHideHomeIndicator: true,
          navigationBarHidden: true,
        }}
      />
      <Stack.Screen
        name="NetworkStream"
        component={NetworkStreamScreen}
        options={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="NetworkPlayer"
        component={NetworkPlayerScreen}
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "fade",
          autoHideHomeIndicator: true,
          navigationBarHidden: true,
        }}
      />
    </Stack.Navigator>
  );
}
