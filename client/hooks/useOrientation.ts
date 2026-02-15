import { useState, useEffect } from "react";
import { Dimensions, ScaledSize } from "react-native";

export type Orientation = "portrait" | "landscape";

interface OrientationInfo {
  orientation: Orientation;
  isPortrait: boolean;
  isLandscape: boolean;
  width: number;
  height: number;
}

export function useOrientation(): OrientationInfo {
  const [dimensions, setDimensions] = useState(() => Dimensions.get("window"));

  useEffect(() => {
    const subscription = Dimensions.addEventListener(
      "change",
      ({ window }: { window: ScaledSize }) => {
        setDimensions(window);
      }
    );

    return () => subscription?.remove();
  }, []);

  const isPortrait = dimensions.height > dimensions.width;
  const isLandscape = dimensions.width > dimensions.height;

  return {
    orientation: isPortrait ? "portrait" : "landscape",
    isPortrait,
    isLandscape,
    width: dimensions.width,
    height: dimensions.height,
  };
}
