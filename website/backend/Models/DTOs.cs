namespace RouteTracker.Models;

/// <summary>
/// Response DTO for key pair generation
/// </summary>
public record KeyPairResponse(string PushKey, string ViewKey);

/// <summary>
/// Response DTO for key status check
/// </summary>
public record KeyStatusResponse(bool IsValid, DateTime? LastActivityAt);

/// <summary>
/// Request DTO for submitting route points
/// </summary>
public record RoutePointRequest(
    float X,
    float Y,
    float Z,
    float GlobalX,
    float GlobalY,
    float GlobalZ,
    uint MapId,
    string? MapIdStr,
    byte GlobalMapId,
    ulong TimestampMs
);

/// <summary>
/// DTO for broadcasting route points via SignalR
/// </summary>
public record RoutePointBroadcast(
    float X,
    float Y,
    float Z,
    float GlobalX,
    float GlobalY,
    float GlobalZ,
    uint MapId,
    string? MapIdStr,
    byte GlobalMapId,
    ulong TimestampMs,
    DateTime ReceivedAt
);

