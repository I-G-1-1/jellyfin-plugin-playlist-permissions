# Install Dotnet
wget https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -O packages-microsoft-prod.deb && \
sudo dpkg -i packages-microsoft-prod.deb && \
rm packages-microsoft-prod.deb && \
sudo apt-get update && \
sudo apt-get install -y dotnet-sdk-10.0 && \
sudo apt-get install zip
#
dotnet --version

#Local Deploy Script
cd ~/Jellyfin.Plugin.PlaylistPermissions && \
rm -rf publish bin obj && \
dotnet publish -c Release -o ./publish && \
DEST="/var/lib/jellyfin/plugins/PlaylistPermissions" && \
sudo systemctl stop jellyfin && \
sudo rm -rf "$DEST" && \
sudo mkdir -p "$DEST" && \
sudo cp publish/Jellyfin.Plugin.PlaylistPermissions.dll "$DEST/" && \
sudo cp publish/meta.json "$DEST/" && \
sudo cp publish/thumb.png "$DEST/" && \
sudo chown -R jellyfin:jellyfin "$DEST" && \
sudo systemctl start jellyfin && \
echo "--- installed ---" && \
sudo ls -la "$DEST/"

#
VERSION="1.0.0.0" && \
echo "csproj:        $(grep -o '<Version>[^<]*' ~/Jellyfin.Plugin.PlaylistPermissions/Jellyfin.Plugin.PlaylistPermissions.csproj | cut -d'>' -f2)" && \
echo "meta.json:     $(grep -o '"version": *"[^"]*"' ~/Jellyfin.Plugin.PlaylistPermissions/meta.json | cut -d'"' -f4)" && \
echo "target:        $VERSION"
#

#Remote Deploy Script
PROJECT_DIR="$PWD" && \
VERSION=$(grep -oP '(?<=<Version>)[^<]+' Jellyfin.Plugin.PlaylistPermissions.csproj) && \
echo "Project:  $PROJECT_DIR" && \
echo "Version:  $VERSION" && \
rm -rf publish bin obj upload && \
dotnet publish -c Release -o ./publish && \
mkdir -p upload && \
cd publish && \
ZIPNAME="playlist-permissions-controller_${VERSION}.zip" && \
zip "../upload/$ZIPNAME" Jellyfin.Plugin.PlaylistPermissions.dll meta.json && \
cp "$PROJECT_DIR/thumb.png" ../upload/ && \
MD5=$(md5sum "../upload/$ZIPNAME" | cut -d' ' -f1) && \
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.0000000Z") && \
cp "$PROJECT_DIR/manifest.json" ../upload/manifest.json && \
sed -i \
  -e "s|__VERSION__|${VERSION}|g" \
  -e "s|__CHECKSUM__|${MD5}|g" \
  -e "s|__TIMESTAMP__|${NOW}|g" \
  ../upload/manifest.json && \
cd "$PROJECT_DIR" && \
echo "" && \
echo "=== upload/ ===" && \
ls -la upload/ && \
echo "" && \
echo "=== manifest.json ===" && \
cat upload/manifest.json
#

#Clean after Deploy
rm -rf bin obj publish artifacts upload
#