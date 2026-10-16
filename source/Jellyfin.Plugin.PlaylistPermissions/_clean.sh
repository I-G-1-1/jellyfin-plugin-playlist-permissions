if [ -f Jellyfin.Plugin.PlaylistPermissions.csproj ]; then
  echo "Folder: $PWD"
  echo "Will delete: bin obj publish artifacts upload"
  read -p "Continue? [y/N] " ans
  if [ "$ans" = "y" ]; then
    rm -rf bin obj publish artifacts upload
    echo "Done."
  else
    echo "Cancelled."
  fi
else
  echo "ERROR: not in Jellyfin.Plugin.PlaylistPermissions"
fi
