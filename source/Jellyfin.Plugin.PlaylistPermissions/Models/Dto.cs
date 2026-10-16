using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.PlaylistPermissions.Models;

public class PlaylistPermissionDto
{
    public string PlaylistId { get; set; } = string.Empty;
    public string PlaylistName { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public bool OpenAccess { get; set; }
    public List<string> CanEditBy { get; set; } = new();
    public List<string> Tags { get; set; } = new();
}

public class ModifyPermissionRequest
{
    public string TargetUserId { get; set; } = string.Empty;
    public string PlaylistId { get; set; } = string.Empty;
    public bool Revoke { get; set; }
}

public class TagRequest
{
    public string PlaylistId { get; set; } = string.Empty;
    public string Tag { get; set; } = string.Empty;
    public bool Add { get; set; }
}

public class TagAllRequest
{
    public Guid OwnerUserId { get; set; }
    public string Tag { get; set; } = string.Empty;
    public bool Add { get; set; }
}

public class OpenAccessRequest
{
    public string PlaylistId { get; set; } = string.Empty;
    public bool Enable { get; set; }
}
