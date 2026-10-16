using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.PlaylistPermissions.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Seconds to wait for the DB to settle after a write.</summary>
    public int RefreshDelaySeconds { get; set; } = 5;

    /// <summary>Only operate on audio playlists (mirrors the Python script).</summary>
    public bool AudioOnly { get; set; } = true;
}
