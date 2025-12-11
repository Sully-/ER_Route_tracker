import { Route } from '../../types/route';
import './RouteInfo.css';

interface RouteInfoProps {
  route: Route | null;
}

export default function RouteInfo({ route }: RouteInfoProps) {
  if (!route) return null;

  const formatDuration = (secs: number): string => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="route-info">
      <h3>Route Info</h3>
      <p>
        Name: <span className="stat">{route.name || 'Unnamed'}</span>
      </p>
      <p>
        Points: <span className="stat">{route.point_count || route.points.length}</span>
      </p>
      <p>
        Duration:{' '}
        <span className="stat">
          {route.duration_secs ? formatDuration(route.duration_secs) : '-'}
        </span>
      </p>
      <p>
        Recorded: <span className="stat">{route.recorded_at || '-'}</span>
      </p>
    </div>
  );
}

