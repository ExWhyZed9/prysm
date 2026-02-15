import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import SetupScreen from "@/screens/SetupScreen";
import PlayerScreen from "@/screens/PlayerScreen";
import { usePlaylist } from "@/context/PlaylistContext";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type RootStackParamList = {
  Setup: { fromSettings?: boolean } | undefined;
  Main: undefined;
  Player: { channelId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const { playlist, isLoading } = usePlaylist();
  const screenOptions = useScreenOptions();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {playlist ? (
        <>
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
        </>
      ) : (
        <Stack.Screen
          name="Setup"
          component={SetupScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
