import { Route } from '../types/route';

/**
 * Export a route as a JSON file download.
 * The exported format is compatible with both the mod's SavedRoute format
 * and the site's static route loading functionality.
 * 
 * @param route - The route to export
 * @param filename - Optional custom filename (without extension)
 */
export function exportRouteAsJson(route: Route, filename?: string): void {
  if (!route || !route.points || route.points.length === 0) {
    console.warn('Cannot export empty route');
    return;
  }

  // Calculate the actual duration based on timestamps
  const durationSecs = route.points.length > 1
    ? (route.points[route.points.length - 1].timestamp_ms - route.points[0].timestamp_ms) / 1000
    : 0;

  // Create export data with updated metadata
  const exportData: Route = {
    name: route.name,
    recorded_at: route.recorded_at,
    duration_secs: durationSecs,
    interval_ms: route.interval_ms || 100,
    point_count: route.points.length,
    points: route.points,
  };

  // Serialize to pretty JSON
  const json = JSON.stringify(exportData, null, 2);

  // Create blob and trigger download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const baseName = filename?.trim() || `route_${timestamp}`;
  const safeFilename = baseName.replace(/[<>:"/\\|?*]/g, '_'); // Remove invalid chars

  // Create download link and trigger click
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename}.json`;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`Exported route: ${safeFilename}.json (${route.points.length} points)`);
}
