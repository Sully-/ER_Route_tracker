// Boss types from enemies.csv (processed)

export interface Boss {
  id: number;
  flagId: number;
  iconId: number;
  areaNo: number;
  gridXNo: number;
  gridZNo: number;
  posX: number;
  posY: number;
  posZ: number;
  globalX: number;
  globalY: number;
  globalZ: number;
  mapId: string;
  bossName: string;
  place: string;
  regionName: string;
}

export interface BossesData {
  bosses: Boss[];
  totalCount: number;
  convertedCount: number;
  failedCount: number;
  skippedCount: number;
  failedMaps: string[];
}
