// Map Icons types for Elden Ring locations

export interface MapIconText {
  TextId: number;
  TextType: number;
  Text: string | null;
  Source: string;
}

export interface MapIcon {
  id: number;
  iconId: number;
  eventFlagId: number;
  // Original local coordinates
  areaNo: number;
  gridXNo: number;
  gridZNo: number;
  posX: number;
  posY: number;
  posZ: number;
  // Converted global coordinates
  globalX: number;
  globalY: number;
  globalZ: number;
  // Map identifier (m60 or m61)
  mapId: string;
  // Text data
  texts: MapIconText[];
}

export interface MapIconsData {
  bonfires: MapIcon[];
  mapPoints: MapIcon[];
  // Statistics
  totalCount: number;
  convertedCount: number;
  failedCount: number;
  failedMaps: string[];
}

// Icon categories for filtering
export type MapIconCategory = 'bonfires' | 'mapPoints' | 'all';

// Helper to get primary text for an icon
export function getIconPrimaryText(icon: MapIcon): string | null {
  const locationText = icon.texts.find((t) => t.TextType === 0);
  if (locationText?.Text) return locationText.Text;
  
  const characterText = icon.texts.find((t) => t.TextType === 1);
  if (characterText?.Text) return characterText.Text;
  
  return icon.texts[0]?.Text ?? null;
}

// Helper to get all texts formatted
export function getIconAllTexts(icon: MapIcon): string[] {
  return icon.texts
    .filter((t) => t.Text !== null)
    .map((t) => t.Text as string);
}

