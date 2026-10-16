using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.PlaylistPermissions.Models;
using Jellyfin.Plugin.PlaylistPermissions.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.PlaylistPermissions.Api;

[ApiController]
[Authorize(Policy = "RequiresElevation")]
[Route("Plugins/PlaylistPermissions")]
public class PlaylistPermissionsController : ControllerBase
{
    private readonly PlaylistPermissionService _svc;

    public PlaylistPermissionsController(PlaylistPermissionService svc) => _svc = svc;

    [HttpGet("Permissions")]
    public async Task<ActionResult<IEnumerable<PlaylistPermissionDto>>> GetPermissions(CancellationToken ct)
        => Ok(await _svc.ListPermissionsAsync(ct));

    [HttpPost("Permission")]
    public async Task<IActionResult> ModifyPermission([FromBody] ModifyPermissionRequest req, CancellationToken ct)
    {
        await _svc.ModifyPermissionAsync(req, ct);
        return NoContent();
    }

    [HttpPost("Tag")]
    public async Task<IActionResult> ModifyTag([FromBody] TagRequest req, CancellationToken ct)
    {
        await _svc.ModifyTagAsync(req, ct);
        return NoContent();
    }

    [HttpPost("TagAll")]
    public async Task<IActionResult> ModifyAllTags([FromBody] TagAllRequest req, CancellationToken ct)
    {
        await _svc.ModifyAllTagsAsync(req, ct);
        return NoContent();
    }

    [HttpPost("OpenAccess")]
    public async Task<IActionResult> ModifyOpenAccess([FromBody] OpenAccessRequest req, CancellationToken ct)
    {
        await _svc.ModifyOpenAccessAsync(req, ct);
        return NoContent();
    }

    [HttpPost("Logout/{userId:guid}")]
    public async Task<IActionResult> LogoutUser(Guid userId, CancellationToken ct)
    {
        await _svc.LogoutUserAsync(userId, ct);
        return NoContent();
    }
}
