import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export const wp = (percentage: number): number => {
  return PixelRatio.roundToNearestPixel((SCREEN_WIDTH * percentage) / 100);
};

export const hp = (percentage: number): number => {
  return PixelRatio.roundToNearestPixel((SCREEN_HEIGHT * percentage) / 100);
};

export const scale = (size: number): number => {
  const widthScale = SCREEN_WIDTH / BASE_WIDTH;
  const heightScale = SCREEN_HEIGHT / BASE_HEIGHT;
  const avgScale = (widthScale + heightScale) / 2;
  return PixelRatio.roundToNearestPixel(size * Math.min(avgScale, 1.5));
};

export const moderateScale = (size: number, factor: number = 0.5): number => {
  const widthScale = SCREEN_WIDTH / BASE_WIDTH;
  return PixelRatio.roundToNearestPixel(size + (widthScale - 1) * factor * size);
};

export const getScreenDimensions = () => {
  const { width, height } = Dimensions.get("window");
  return { width, height };
};

export const getAspectRatio = (): number => {
  const { width, height } = Dimensions.get("window");
  return width / height;
};

export const isUltraWide = (): boolean => {
  return getAspectRatio() > 2;
};

export const isExtraWide = (): boolean => {
  return getAspectRatio() > 2.2;
};

export const getSidebarWidth = (): number => {
  const ratio = getAspectRatio();
  const { width } = getScreenDimensions();
  
  if (ratio > 2.2) {
    return Math.min(90, width * 0.05);
  } else if (ratio > 2) {
    return Math.min(100, width * 0.06);
  } else if (ratio > 1.7) {
    return Math.min(100, width * 0.08);
  }
  return Math.min(100, width * 0.1);
};

export const getChannelCardWidth = (): number => {
  const { width } = getScreenDimensions();
  const ratio = getAspectRatio();
  
  // For portrait mobile, use minimal padding
  if (ratio <= 1 && width < 500) {
    const padding = 8;
    const cardsPerRow = 3;
    const gapWidth = 4 * (cardsPerRow - 1);
    return Math.floor((width - padding - gapWidth) / cardsPerRow);
  }
  
  const sidebarWidth = getSidebarWidth();
  const availableWidth = width - sidebarWidth - 48;
  
  let cardsPerRow: number;
  if (ratio > 2.2) {
    cardsPerRow = 8;
  } else if (ratio > 2) {
    cardsPerRow = 7;
  } else if (ratio > 1.7) {
    cardsPerRow = 6;
  } else if (ratio > 1.5) {
    cardsPerRow = 5;
  } else {
    cardsPerRow = 4;
  }
  
  const gapWidth = 12 * (cardsPerRow - 1);
  return Math.floor((availableWidth - gapWidth) / cardsPerRow);
};

export const getGridColumns = (): number => {
  const ratio = getAspectRatio();
  const { width } = getScreenDimensions();
  
  if (ratio > 2.2) {
    return 8;
  } else if (ratio > 2) {
    return 7;
  } else if (ratio > 1.7) {
    return 6;
  } else if (ratio > 1.5) {
    return 5;
  } else if (ratio > 1) {
    return 4;
  }
  // Portrait mode on mobile - use 3 columns for phones
  if (width < 500) {
    return 3;
  }
  return 4;
};

export const getPlayerControlSize = (): { play: number; nav: number; icon: number } => {
  const { height } = getScreenDimensions();
  const ratio = getAspectRatio();
  
  const basePlaySize = Math.min(72, height * 0.12);
  const baseNavSize = Math.min(56, height * 0.09);
  const baseIconSize = Math.min(24, height * 0.04);
  
  if (ratio > 2) {
    return {
      play: basePlaySize * 0.9,
      nav: baseNavSize * 0.9,
      icon: baseIconSize * 0.9,
    };
  }
  
  return {
    play: basePlaySize,
    nav: baseNavSize,
    icon: baseIconSize,
  };
};
