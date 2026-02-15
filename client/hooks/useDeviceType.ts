import { useState, useEffect } from "react";
import { Platform, Dimensions, ScaledSize } from "react-native";
import * as Device from "expo-device";

interface DeviceTypeInfo {
  isTV: boolean;
  isTablet: boolean;
  isPhone: boolean;
  isMobile: boolean;
  deviceType: "phone" | "tablet" | "tv" | "desktop";
}

export function useDeviceType(): DeviceTypeInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceTypeInfo>(() => getDeviceType());

  useEffect(() => {
    const subscription = Dimensions.addEventListener(
      "change",
      () => {
        setDeviceInfo(getDeviceType());
      }
    );

    return () => subscription?.remove();
  }, []);

  return deviceInfo;
}

function getDeviceType(): DeviceTypeInfo {
  const { width, height } = Dimensions.get("window");
  const screenSize = Math.max(width, height);
  const aspectRatio = Math.max(width, height) / Math.min(width, height);

  const isTV = Platform.isTV || 
    (Platform.OS === "android" && Device.deviceType === Device.DeviceType.TV) ||
    (screenSize > 1200 && aspectRatio > 1.5 && aspectRatio < 2);

  const isTablet = !isTV && (
    Device.deviceType === Device.DeviceType.TABLET ||
    (screenSize > 768 && screenSize <= 1200)
  );

  const isPhone = !isTV && !isTablet && (
    Device.deviceType === Device.DeviceType.PHONE ||
    screenSize <= 768
  );

  const isMobile = isPhone || isTablet;

  let deviceType: "phone" | "tablet" | "tv" | "desktop";
  if (isTV) {
    deviceType = "tv";
  } else if (isTablet) {
    deviceType = "tablet";
  } else if (isPhone) {
    deviceType = "phone";
  } else {
    deviceType = "desktop";
  }

  return {
    isTV,
    isTablet,
    isPhone,
    isMobile,
    deviceType,
  };
}

export function isAndroidTV(): boolean {
  return Platform.OS === "android" && (
    Platform.isTV ||
    Device.deviceType === Device.DeviceType.TV
  );
}
