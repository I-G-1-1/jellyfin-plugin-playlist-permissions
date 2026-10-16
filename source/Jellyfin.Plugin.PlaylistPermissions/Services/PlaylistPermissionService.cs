using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Data.Queries;                          // DeviceQuery
using Jellyfin.Plugin.PlaylistPermissions.Models;
using MediaBrowser.Controller.Devices;                // IDeviceManager
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Playlists;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;                    // QueryResult<T>
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.PlaylistPermissions.Services;

public class PlaylistPermissionService
{
    private readonly ILibraryManager _library;
    private readonly IUserManager _users;
    private readonly ISessionManager _sessions;
    private readonly IDeviceManager _devices;
    private readonly ILogger<PlaylistPermissionService> _log;

    public PlaylistPermissionService(
        ILibraryManager library,
        IUserManager users,
        ISessionManager sessions,
        IDeviceManager devices,
        ILogger<PlaylistPermissionService> log)
    {
        _library = library;
        _users = users;
        _sessions = sessions;
        _devices = devices;
        _log = log;
    }

    private IEnumerable<Playlist> GetAllPlaylists()
    {
        var q = new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Playlist },
            Recursive = true,
            IsVirtualItem = false
        };
        var all = _library.GetItemList(q).OfType<Playlist>();
        if (Plugin.Instance?.Configuration.AudioOnly == true)
            all = all.Where(p => p.MediaType == MediaType.Audio);
        return all;
    }

    private static string Norm(string? s) =>
        (s ?? string.Empty).Replace("-", "").Replace("[", "").Replace("]", "").ToLowerInvariant();

    private Playlist ResolvePlaylist(string input)
    {
        var all = GetAllPlaylists().ToList();
        var clean = Norm(input);

        var exact = all.FirstOrDefault(p => Norm(p.Id.ToString("N")) == clean);
        if (exact != null) return exact;

        var prefix = all.Where(p => Norm(p.Id.ToString("N")).StartsWith(clean)).ToList();
        if (prefix.Count == 1) return prefix[0];
        if (prefix.Count > 1)
            throw new InvalidOperationException(
                $"Multiple playlists match prefix '{input}': " +
                string.Join(", ", prefix.Select(p => $"{p.Name} [{p.Id:N}]")));

        var byName = all.Where(p => p.Name.Equals(input, StringComparison.OrdinalIgnoreCase)).ToList();
        if (byName.Count == 1) return byName[0];
        if (byName.Count > 1)
            throw new InvalidOperationException($"Multiple playlists named '{input}'.");

        throw new InvalidOperationException($"Playlist '{input}' not found.");
    }

    public Task<List<PlaylistPermissionDto>> ListPermissionsAsync(CancellationToken ct = default)
    {
        var list = new List<PlaylistPermissionDto>();

        foreach (var pl in GetAllPlaylists())
        {
            var ownerName = "<unknown>";
            if (pl.OwnerUserId != Guid.Empty)
            {
                var owner = _users.GetUserById(pl.OwnerUserId);
                if (owner != null) ownerName = owner.Username;
            }

            var dto = new PlaylistPermissionDto
            {
                PlaylistId = pl.Id.ToString("N"),
                PlaylistName = pl.Name,
                OwnerId = pl.OwnerUserId.ToString("N"),
                OwnerName = ownerName,
                OpenAccess = pl.OpenAccess,
                Tags = pl.Tags?.ToList() ?? new List<string>()
            };

            foreach (var share in pl.Shares ?? new List<PlaylistUserPermissions>())
            {
                if (!share.CanEdit) continue;
                if (share.UserId == pl.OwnerUserId) continue;
                var u = _users.GetUserById(share.UserId);
                dto.CanEditBy.Add(u?.Username ?? share.UserId.ToString("N"));
            }

            list.Add(dto);
        }

        return Task.FromResult(list);
    }

    public async Task ModifyPermissionAsync(ModifyPermissionRequest req, CancellationToken ct = default)
    {
        if (!Guid.TryParse(req.PlaylistId, out var plId))
            throw new ArgumentException("Invalid playlist id.");

        var playlist = _library.GetItemById<Playlist>(plId)
            ?? throw new ArgumentException("Playlist not found.");

        if (!Guid.TryParse(req.TargetUserId, out var tuid))
            throw new ArgumentException("Invalid user id.");

        if (_users.GetUserById(tuid) == null)
            throw new ArgumentException("Target user not found.");

        var shares = playlist.Shares?.ToList() ?? new List<PlaylistUserPermissions>();
        var existing = shares.FirstOrDefault(s => s.UserId == tuid);

        if (req.Revoke)
        {
            if (existing != null) shares.Remove(existing);
        }
        else
        {
            if (existing == null) shares.Add(new PlaylistUserPermissions(tuid, true));
            else existing.CanEdit = true;
        }

        playlist.Shares = shares;
        await _library.UpdateItemAsync(playlist, playlist.GetParent(), ItemUpdateType.MetadataEdit, ct);
        _log.LogInformation("Permission {Action} on '{Name}' for user {Uid}",
            req.Revoke ? "revoked" : "granted", playlist.Name, tuid);
    }

    public async Task ModifyTagAsync(TagRequest req, CancellationToken ct = default)
    {
        var playlist = ResolvePlaylist(req.PlaylistId);
        var tags = playlist.Tags?.ToList() ?? new List<string>();

        if (req.Add)
        {
            if (!tags.Contains(req.Tag)) tags.Add(req.Tag);
        }
        else
        {
            tags.RemoveAll(t => t.Equals(req.Tag, StringComparison.OrdinalIgnoreCase));
        }

        playlist.Tags = tags.ToArray();
        await _library.UpdateItemAsync(playlist, playlist.GetParent(), ItemUpdateType.MetadataEdit, ct);
        _log.LogInformation("Tag '{Tag}' {Action} on '{Name}'",
            req.Tag, req.Add ? "added" : "removed", playlist.Name);
    }

    public async Task ModifyAllTagsAsync(TagAllRequest req, CancellationToken ct = default)
    {
        var playlists = GetAllPlaylists().Where(p => p.OwnerUserId == req.OwnerUserId).ToList();
        foreach (var pl in playlists)
        {
            var tags = pl.Tags?.ToList() ?? new List<string>();
            if (req.Add)
            {
                if (!tags.Contains(req.Tag)) tags.Add(req.Tag);
            }
            else
            {
                tags.RemoveAll(t => t.Equals(req.Tag, StringComparison.OrdinalIgnoreCase));
            }
            pl.Tags = tags.ToArray();
            await _library.UpdateItemAsync(pl, pl.GetParent(), ItemUpdateType.MetadataEdit, ct);
        }
        _log.LogInformation("Tag '{Tag}' {Action} on {Count} playlists for user {Uid}",
            req.Tag, req.Add ? "added" : "removed", playlists.Count, req.OwnerUserId);
    }

    public async Task ModifyOpenAccessAsync(OpenAccessRequest req, CancellationToken ct = default)
    {
        var playlist = ResolvePlaylist(req.PlaylistId);
        playlist.OpenAccess = req.Enable;
        await _library.UpdateItemAsync(playlist, playlist.GetParent(), ItemUpdateType.MetadataEdit, ct);
        _log.LogInformation("OpenAccess={State} on '{Name}'", req.Enable, playlist.Name);
    }

    public async Task LogoutUserAsync(Guid userId, CancellationToken ct = default)
    {
        var user = _users.GetUserById(userId)
            ?? throw new ArgumentException("User not found.");

        // Revoke the access token of every device registered to this user.
        // GetDevices is synchronous in Jellyfin 12.x — it returns QueryResult<Device>.
        var result = _devices.GetDevices(new DeviceQuery { UserId = userId });

        var count = 0;
        foreach (var device in result.Items)
        {
            await _sessions.Logout(device).ConfigureAwait(false);
            count++;
        }

        _log.LogInformation("Logged out {Count} device(s) for {User}", count, user.Username);
    }
}
