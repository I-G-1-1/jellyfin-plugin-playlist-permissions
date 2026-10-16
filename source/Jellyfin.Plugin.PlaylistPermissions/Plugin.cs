using System;
using System.Collections.Generic;
using Jellyfin.Plugin.PlaylistPermissions.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.PlaylistPermissions;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Playlist Permissions Controller";

    public override Guid Id => Guid.Parse("f1a2b3c4-d5e6-47f8-9a0b-1c2d3e4f5a6b");

    public override string Description =>
        "Manage Jellyfin playlist edit permissions, tags and public access (admin only).";

    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo
        {
            Name = Name,
            EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html",
            EnableInMainMenu = true,
            MenuIcon = "playlist_play"
        },
        new PluginPageInfo
        {
            Name = "PlaylistPermissions.js",
            EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.js"
        }
    };
}
