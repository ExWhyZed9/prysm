import { useState, useEffect } from "react";
import { Dimensions, ScaledSize } from "react-native";
import {
  getScreenDimensions,
  getAspectRatio,
  isUltraWide,
  isExtraWide,
  getSidebarWidth,
  getChannelCardWidth,
  getGridColumns,
  getPlayerControlSize,
} from "@/lib/responsive";

interface ResponsiveValues {
  width: number;
  height: number;
  aspectRatio: number;
  isUltraWide: boolean;
  isExtraWide: boolean;
  sidebarWidth: number;
  cardWidth: number;
  gridColumns: number;
  playerControls: { play: number; nav: number; icon: number };
}

export function useResponsive(): ResponsiveValues {
  const [dimensions, setDimensions] = useState(getScreenDimensions());

  useEffect(() => {
    const subscription = Dimensions.addEventListener(
      "change",
      ({ window }: { window: ScaledSize }) => {
        setDimensions({ width: window.width, height: window.height });
      }
    );

    return () => subscription?.remove();
  }, []);

  return {
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: getAspectRatio(),
    isUltraWide: isUltraWide(),
    isExtraWide: isExtraWide(),
    sidebarWidth: getSidebarWidth(),
    cardWidth: getChannelCardWidth(),
    gridColumns: getGridColumns(),
    playerControls: getPlayerControlSize(),
  };
}
