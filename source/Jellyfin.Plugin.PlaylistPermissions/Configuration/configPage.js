(function () {
    'use strict';

    var pluginId = 'f1a2b3c4-d5e6-47f8-9a0b-1c2d3e4f5a6b';
    var state = { playlists: [], users: [] };

    // --- inline styles (Jellyfin 12 strips <style> from plugin pages) ---

    var OWNER_STYLE = [
        'margin-top:64px',
        'margin-bottom:20px',
        'padding:14px 20px',
        'font-size:20px',
        'font-weight:700',
        'letter-spacing:0.6px',
        'color:#ffffff',
        'background:linear-gradient(90deg,#00a4dc 0%,#007ba3 100%)',
        'border-radius:6px',
        'border-left:6px solid #00e5ff',
        'text-transform:uppercase',
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'gap:20px'
    ].join(';');

    var TAG_STYLE = [
        'display:inline-block',
        'padding:3px 10px',
        'background:#333',
        'border-radius:12px',
        'margin:2px 4px 2px 0',
        'font-size:12px',
        'color:#e0e0e0'
    ].join(';');

    // --- helpers ----------------------------------------------------------

    function normalizePlaylist(p) {
        return {
            playlistId:   p.playlistId   || p.PlaylistId   || '',
            playlistName: p.playlistName || p.PlaylistName || '',
            ownerId:      p.ownerId      || p.OwnerId      || '',
            ownerName:    p.ownerName    || p.OwnerName    || '<unknown>',
            openAccess:   p.openAccess !== undefined ? p.openAccess : !!p.OpenAccess,
            canEditBy:    p.canEditBy    || p.CanEditBy    || [],
            tags:         p.tags         || p.Tags         || []
        };
    }

    function normalizeUser(u) {
        return { id: u.id || u.Id || '', name: u.name || u.Name || '' };
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
        });
    }

    function showMsg(text, ok) {
        var s = document.getElementById('status');
        if (!s) return;
        s.innerHTML = '<div style="padding:10px;border-radius:4px;margin:12px 0;' +
            (ok === false ? 'background:#4d1b1b;color:#ef9a9a' : 'background:#1b4d20;color:#a5d6a7') +
            '">' + escapeHtml(text) + '</div>';
        if (ok !== false) setTimeout(function () { s.innerHTML = ''; }, 4000);
    }

    function api(path, opts) {
        opts = opts || {};
        var method = opts.method || 'GET';
        var url = ApiClient.getUrl(path);
        if (method === 'GET') {
            url += (url.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now();
        }
        return ApiClient.ajax({
            url: url,
            type: method,
            data: opts.body ? JSON.stringify(opts.body) : undefined,
            contentType: 'application/json',
            dataType: method === 'GET' ? 'json' : 'text'
        });
    }

    // --- full-screen spinner overlay --------------------------------------

    function ensureOverlay() {
        var el = document.getElementById('ppOverlay');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'ppOverlay';
        el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);' +
            'z-index:99999;align-items:center;justify-content:center;flex-direction:column;' +
            'color:#fff;font-family:inherit;font-size:16px';
        el.innerHTML =
            '<svg width="56" height="56" viewBox="0 0 50 50">' +
              '<circle cx="25" cy="25" r="20" fill="none" stroke="#2a2a2a" stroke-width="5"/>' +
              '<circle cx="25" cy="25" r="20" fill="none" stroke="#00a4dc" stroke-width="5" ' +
                      'stroke-linecap="round" stroke-dasharray="31.4 94.2">' +
                '<animateTransform attributeName="transform" type="rotate" ' +
                                  'from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite"/>' +
              '</circle>' +
            '</svg>' +
            '<div id="ppOverlayText" style="margin-top:18px;letter-spacing:0.3px">Applying…</div>';
        document.body.appendChild(el);
        return el;
    }

    function showSpinner(text) {
        var el = ensureOverlay();
        var t = document.getElementById('ppOverlayText');
        if (t) t.textContent = text || 'Applying…';
        el.style.display = 'flex';
    }

    function hideSpinner() {
        var el = document.getElementById('ppOverlay');
        if (el) el.style.display = 'none';
    }

    // --- config -----------------------------------------------------------

    function loadConfig() {
        return ApiClient.getPluginConfiguration(pluginId).then(function (cfg) {
            var el = document.getElementById('audioOnly');
            if (!el) return;
            el.checked = cfg.AudioOnly !== undefined ? !!cfg.AudioOnly : !!cfg.audioOnly;
        });
    }

    function saveConfig() {
        var el = document.getElementById('audioOnly');
        var newValue = el ? !!el.checked : false;
        return ApiClient.getPluginConfiguration(pluginId).then(function (cfg) {
            cfg.AudioOnly = newValue;
            return ApiClient.updatePluginConfiguration(pluginId, cfg).then(function () {
                Dashboard.processPluginConfigurationUpdateResult();
                showMsg('Setting saved.');
                return loadAll();
            });
        });
    }

    // --- data: fetch + poll -----------------------------------------------

    function fetchPermissionsOnce() {
        return api('Plugins/PlaylistPermissions/Permissions').then(function (data) {
            return (data || []).map(normalizePlaylist);
        });
    }

    function loadAll() {
        return fetchPermissionsOnce().then(function (list) {
            state.playlists = list;
            return api('Users').then(function (users) {
                state.users = (users || []).map(normalizeUser);
                render();
            });
        }).catch(function (e) {
            showMsg('Failed to load playlists: ' + (e && e.message ? e.message : e), false);
        });
    }

    function pollUntil(predicate, maxMs, intervalMs) {
        maxMs = maxMs || 10000;
        intervalMs = intervalMs || 500;
        var start = Date.now();
        function attempt() {
            return fetchPermissionsOnce().then(function (list) {
                if (predicate(list)) return list;
                if (Date.now() - start >= maxMs) return list;
                return new Promise(function (r) { setTimeout(r, intervalMs); }).then(attempt);
            });
        }
        return attempt();
    }

    // --- render -----------------------------------------------------------

    function render() {
        var byOwner = {};
        state.playlists.forEach(function (p) {
            (byOwner[p.ownerName] = byOwner[p.ownerName] || []).push(p);
        });

        var html = '';
        Object.keys(byOwner).sort().forEach(function (owner, idx) {
            var style = idx === 0 ? OWNER_STYLE.replace('margin-top:64px;', 'margin-top:8px;')
                                  : OWNER_STYLE;
            var playlistCount = byOwner[owner].length;
            html += '<div style="' + style + '">' +
                '<span>Owner: ' + escapeHtml(owner) + '</span>' +
                '<button class="btnBulkEdit" data-owner="' + escapeHtml(owner) +
                  '" style="padding:7px 18px;border:none;border-radius:4px;background:#fff;' +
                  'color:#007ba3;cursor:pointer;font-weight:600;font-size:13px;' +
                  'text-transform:none;letter-spacing:0">' +
                  'Bulk edit (' + playlistCount + ')' +
                '</button>' +
              '</div>';

            html += '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
                    '<th style="text-align:left;padding:10px;border-bottom:1px solid #333;background:#252525">Playlist</th>' +
                    '<th style="text-align:left;padding:10px;border-bottom:1px solid #333;background:#252525;width:12%">Public</th>' +
                    '<th style="text-align:left;padding:10px;border-bottom:1px solid #333;background:#252525;width:23%">Can edit</th>' +
                    '<th style="text-align:left;padding:10px;border-bottom:1px solid #333;background:#252525;width:20%">Tags</th>' +
                    '<th style="text-align:left;padding:10px;border-bottom:1px solid #333;background:#252525;width:10%">Actions</th>' +
                    '</tr></thead><tbody>';

            byOwner[owner]
                .sort(function (a, b) { return (a.playlistName || '').localeCompare(b.playlistName || ''); })
                .forEach(function (p) {
                    var editors = p.canEditBy.length ? p.canEditBy.join(', ') : '—';
                    var tags = p.tags.length
                        ? p.tags.map(function (t) {
                            return '<span style="' + TAG_STYLE + '">' + escapeHtml(t) + '</span>';
                          }).join(' ')
                        : '—';
                    html += '<tr>' +
                        '<td style="padding:10px;border-bottom:1px solid #333">' +
                            escapeHtml(p.playlistName) + '<br><small style="color:#888">[' +
                            escapeHtml(p.playlistId.substring(0,8)) + ']</small></td>' +
                        '<td style="padding:10px;border-bottom:1px solid #333">' + (p.openAccess ? '✔ Yes' : 'No') + '</td>' +
                        '<td style="padding:10px;border-bottom:1px solid #333">' + escapeHtml(editors) + '</td>' +
                        '<td style="padding:10px;border-bottom:1px solid #333">' + tags + '</td>' +
                        '<td style="padding:10px;border-bottom:1px solid #333">' +
                            '<button class="btnEdit" data-pid="' + escapeHtml(p.playlistId) +
                            '" style="padding:5px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Edit</button>' +
                        '</td>' +
                        '</tr>';
                });

            html += '</tbody></table>';
        });

        document.getElementById('PermissionsTable').innerHTML =
            html || '<p>No playlists found.</p>';

        document.querySelectorAll('.btnEdit').forEach(function (b) {
            b.addEventListener('click', function () { openEditor(b.getAttribute('data-pid')); });
        });
        document.querySelectorAll('.btnBulkEdit').forEach(function (b) {
            b.addEventListener('click', function () { openBulkEditor(b.getAttribute('data-owner')); });
        });
    }

    // --- single-playlist editor -------------------------------------------

    function openEditor(playlistId) {
        var p = state.playlists.find(function (x) { return x.playlistId === playlistId; });
        if (!p) return;

        // Lookup of current editors — used only to LABEL the options, not to filter.
        var editorNames = {};
        p.canEditBy.forEach(function (n) { editorNames[String(n).toLowerCase()] = true; });

        var sortedUsers = state.users.slice().sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var userOptions = sortedUsers.length
            ? sortedUsers.map(function (u) {
                var isEditor = !!editorNames[(u.name || '').toLowerCase()];
                var label = u.name + (isEditor ? '  —  already editor' : '');
                return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(label) + '</option>';
              }).join('')
            : '<option value="">(no users found)</option>';

        var editors = p.canEditBy.length ? p.canEditBy.join(', ') : '—';
        var tags = p.tags.length
            ? p.tags.map(function (t) { return '<span style="' + TAG_STYLE + '">' + escapeHtml(t) + '</span>'; }).join(' ')
            : '—';

        document.getElementById('dialogTitle').textContent = p.playlistName;
        document.getElementById('editBody').innerHTML =
            '<p><small style="color:#888">ID: ' + escapeHtml(p.playlistId) + '</small></p>' +

            '<h4>Edit permissions</h4>' +
            '<p>Currently editable by: <strong>' + escapeHtml(editors) + '</strong></p>' +
            '<p><small style="color:#888">Select a user then click Grant or Revoke. ' +
              'Users already marked "already editor" can be revoked from the same dropdown.</small></p>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<select id="targetUser" style="flex:1;min-width:200px;padding:8px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#e0e0e0">' + userOptions + '</select>' +
              '<button id="btnGrant" style="padding:8px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Grant edit</button>' +
              '<button id="btnRevoke" style="padding:8px 14px;border:none;border-radius:4px;background:#d32f2f;color:#fff;cursor:pointer">Revoke edit</button>' +
            '</div>' +

            '<hr style="border:none;border-top:1px solid #333;margin:20px 0">' +

            '<h4>Tags</h4>' +
            '<p>Current tags: ' + tags + '</p>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<input id="tagInput" placeholder="Tag name" style="flex:1;min-width:200px;padding:8px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#e0e0e0" />' +
              '<button id="btnTagAdd" style="padding:8px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Add tag</button>' +
              '<button id="btnTagDel" style="padding:8px 14px;border:none;border-radius:4px;background:#d32f2f;color:#fff;cursor:pointer">Remove tag</button>' +
            '</div>' +

            '<hr style="border:none;border-top:1px solid #333;margin:20px 0">' +

            '<h4>Public access</h4>' +
            '<p>Currently: <strong>' + (p.openAccess ? 'Enabled' : 'Disabled') + '</strong></p>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<button id="btnAccessOn" style="padding:8px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Enable</button>' +
              '<button id="btnAccessOff" style="padding:8px 14px;border:none;border-radius:4px;background:#d32f2f;color:#fff;cursor:pointer">Disable</button>' +
            '</div>';

        document.getElementById('btnGrant').addEventListener('click', function () { grant(playlistId, false); });
        document.getElementById('btnRevoke').addEventListener('click', function () { grant(playlistId, true); });
        document.getElementById('btnTagAdd').addEventListener('click', function () { tagOp(playlistId, true); });
        document.getElementById('btnTagDel').addEventListener('click', function () { tagOp(playlistId, false); });
        document.getElementById('btnAccessOn').addEventListener('click', function () { setAccess(playlistId, true); });
        document.getElementById('btnAccessOff').addEventListener('click', function () { setAccess(playlistId, false); });

        document.getElementById('editDialog').showModal();
    }

    // --- bulk editor ------------------------------------------------------

    function openBulkEditor(ownerName) {
        var owned = state.playlists.filter(function (x) { return x.ownerName === ownerName; });
        if (!owned.length) return;

        var ownerId = owned[0].ownerId;

        var editorSet = {};
        var tagSet = {};
        var anyPublic = false;
        var anyPrivate = false;
        owned.forEach(function (p) {
            p.canEditBy.forEach(function (n) { editorSet[n] = true; });
            p.tags.forEach(function (t) { tagSet[t] = true; });
            if (p.openAccess) anyPublic = true; else anyPrivate = true;
        });
        var allEditors = Object.keys(editorSet).sort();
        var allTags = Object.keys(tagSet).sort();

        var accessLabel = anyPublic && anyPrivate ? 'Mixed'
                        : anyPublic ? 'Enabled' : 'Disabled';

        var userOptions = state.users
            .slice()
            .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
            .map(function (u) {
                return '<option value="' + escapeHtml(u.id) + '">' + escapeHtml(u.name) + '</option>';
            }).join('');

        var editorsDisplay = allEditors.length
            ? allEditors.map(function (n) {
                return '<span style="' + TAG_STYLE + '">' + escapeHtml(n) + '</span>';
              }).join(' ')
            : '—';
        var tagsDisplay = allTags.length
            ? allTags.map(function (t) {
                return '<span style="' + TAG_STYLE + '">' + escapeHtml(t) + '</span>';
              }).join(' ')
            : '—';

        document.getElementById('dialogTitle').textContent =
            'Bulk edit — ' + ownerName + ' (' + owned.length + ' playlists)';

        document.getElementById('editBody').innerHTML =
            '<p style="background:#2a2a2a;padding:12px;border-radius:6px;color:#00e5ff;font-weight:600">' +
                '⚠ Changes below apply to ALL ' + owned.length + ' playlist(s) owned by ' +
                escapeHtml(ownerName) + '.' +
            '</p>' +

            '<h4>Edit permissions (all playlists)</h4>' +
            '<p>Currently editable by: ' + editorsDisplay + '</p>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<select id="bulkTargetUser" style="flex:1;min-width:200px;padding:8px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#e0e0e0">' + userOptions + '</select>' +
              '<button id="bulkBtnGrant" style="padding:8px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Grant to all</button>' +
              '<button id="bulkBtnRevoke" style="padding:8px 14px;border:none;border-radius:4px;background:#d32f2f;color:#fff;cursor:pointer">Revoke from all</button>' +
            '</div>' +

            '<hr style="border:none;border-top:1px solid #333;margin:20px 0">' +

            '<h4>Tags (all playlists)</h4>' +
            '<p>Current tags: ' + tagsDisplay + '</p>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<input id="bulkTagInput" placeholder="Tag name" style="flex:1;min-width:200px;padding:8px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#e0e0e0" />' +
              '<button id="bulkBtnTagAdd" style="padding:8px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Add to all</button>' +
              '<button id="bulkBtnTagDel" style="padding:8px 14px;border:none;border-radius:4px;background:#d32f2f;color:#fff;cursor:pointer">Remove from all</button>' +
            '</div>' +

            '<hr style="border:none;border-top:1px solid #333;margin:20px 0">' +

            '<h4>Public access (all playlists)</h4>' +
            '<p>Currently: <strong>' + accessLabel + '</strong></p>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
              '<button id="bulkBtnAccessOn" style="padding:8px 14px;border:none;border-radius:4px;background:#00a4dc;color:#fff;cursor:pointer">Enable all</button>' +
              '<button id="bulkBtnAccessOff" style="padding:8px 14px;border:none;border-radius:4px;background:#d32f2f;color:#fff;cursor:pointer">Disable all</button>' +
            '</div>';

        document.getElementById('bulkBtnGrant').addEventListener('click', function () {
            bulkGrant(owned, false);
        });
        document.getElementById('bulkBtnRevoke').addEventListener('click', function () {
            bulkGrant(owned, true);
        });
        document.getElementById('bulkBtnTagAdd').addEventListener('click', function () {
            bulkTag(ownerId, owned, true);
        });
        document.getElementById('bulkBtnTagDel').addEventListener('click', function () {
            bulkTag(ownerId, owned, false);
        });
        document.getElementById('bulkBtnAccessOn').addEventListener('click', function () {
            bulkAccess(owned, true);
        });
        document.getElementById('bulkBtnAccessOff').addEventListener('click', function () {
            bulkAccess(owned, false);
        });

        document.getElementById('editDialog').showModal();
    }

    // --- dialog helpers ---------------------------------------------------

    function closeDialog() {
        var d = document.getElementById('editDialog');
        if (d && d.open) d.close();
    }

    function findPlaylist(id) {
        return state.playlists.find(function (x) { return x.playlistId === id; });
    }

    function runWithSpinner(spinnerText, actionPromise, successMsg, optimistic) {
        closeDialog();
        if (optimistic) { optimistic(); render(); }
        showSpinner(spinnerText);
        return actionPromise.then(function () {
            return new Promise(function (r) { setTimeout(r, 900); });
        }).then(function () {
            return loadAll();
        }).then(function () {
            hideSpinner();
            showMsg(successMsg);
        }).catch(function (e) {
            hideSpinner();
            showMsg('Failed: ' + (e && e.message ? e.message : e), false);
        });
    }

    // --- single-playlist write actions ------------------------------------

    function applyChange(spinnerText, postCall, predicate, successMsg, optimistic) {
        closeDialog();
        if (optimistic) { optimistic(); render(); }
        showSpinner(spinnerText);
        return postCall.then(function () {
            return pollUntil(predicate, 10000, 500);
        }).then(function (freshList) {
            if (freshList) {
                state.playlists = freshList;
                render();
            }
            hideSpinner();
            showMsg(successMsg);
        }).catch(function (e) {
            hideSpinner();
            showMsg('Failed: ' + (e && e.message ? e.message : e), false);
        });
    }

    function grant(playlistId, revoke) {
        var sel = document.getElementById('targetUser');
        if (!sel || !sel.value) return showMsg('Select a user first', false);
        var userId = sel.value;
        // Strip the "— already editor" suffix we appended to the label
        var userName = sel.options[sel.selectedIndex].text.replace(/\s+—\s+already editor$/, '').trim();

        var optimistic = function () {
            var p = findPlaylist(playlistId);
            if (!p) return;
            if (revoke) {
                p.canEditBy = p.canEditBy.filter(function (n) {
                    return String(n).toLowerCase() !== userName.toLowerCase();
                });
            } else if (p.canEditBy.map(function (n) { return String(n).toLowerCase(); })
                            .indexOf(userName.toLowerCase()) === -1) {
                p.canEditBy.push(userName);
            }
        };

        var post = api('Plugins/PlaylistPermissions/Permission', {
            method: 'POST',
            body: { TargetUserId: userId, PlaylistId: playlistId, Revoke: revoke }
        });

        var predicate = function (list) {
            var pl = list.find(function (x) { return x.playlistId === playlistId; });
            if (!pl) return true;
            var has = pl.canEditBy.map(function (n) { return String(n).toLowerCase(); })
                                 .indexOf(userName.toLowerCase()) !== -1;
            return revoke ? !has : has;
        };

        return applyChange(
            revoke ? 'Revoking edit…' : 'Granting edit…',
            post, predicate,
            'Permission ' + (revoke ? 'revoked' : 'granted') + '.',
            optimistic
        );
    }

    function tagOp(playlistId, add) {
        var el = document.getElementById('tagInput');
        var tag = (el && el.value ? el.value : '').trim();
        if (!tag) return showMsg('Enter a tag name', false);

        var optimistic = function () {
            var p = findPlaylist(playlistId);
            if (!p) return;
            if (add) {
                if (p.tags.indexOf(tag) === -1) p.tags.push(tag);
            } else {
                p.tags = p.tags.filter(function (t) { return t !== tag; });
            }
        };

        var post = api('Plugins/PlaylistPermissions/Tag', {
            method: 'POST',
            body: { PlaylistId: playlistId, Tag: tag, Add: add }
        });

        var predicate = function (list) {
            var pl = list.find(function (x) { return x.playlistId === playlistId; });
            if (!pl) return true;
            var has = pl.tags.indexOf(tag) !== -1;
            return add ? has : !has;
        };

        return applyChange(
            add ? 'Adding tag…' : 'Removing tag…',
            post, predicate,
            'Tag ' + (add ? 'added' : 'removed') + '.',
            optimistic
        );
    }

    function setAccess(playlistId, enable) {
        var optimistic = function () {
            var p = findPlaylist(playlistId);
            if (p) p.openAccess = enable;
        };

        var post = api('Plugins/PlaylistPermissions/OpenAccess', {
            method: 'POST',
            body: { PlaylistId: playlistId, Enable: enable }
        });

        var predicate = function (list) {
            var pl = list.find(function (x) { return x.playlistId === playlistId; });
            if (!pl) return true;
            return pl.openAccess === enable;
        };

        return applyChange(
            enable ? 'Enabling public access…' : 'Disabling public access…',
            post, predicate,
            'Public access ' + (enable ? 'enabled' : 'disabled') + '.',
            optimistic
        );
    }

    // --- bulk write actions -----------------------------------------------

    function bulkTag(ownerId, owned, add) {
        var el = document.getElementById('bulkTagInput');
        var tag = (el && el.value ? el.value : '').trim();
        if (!tag) return showMsg('Enter a tag name', false);

        var optimistic = function () {
            owned.forEach(function (o) {
                var p = findPlaylist(o.playlistId);
                if (!p) return;
                if (add) {
                    if (p.tags.indexOf(tag) === -1) p.tags.push(tag);
                } else {
                    p.tags = p.tags.filter(function (t) { return t !== tag; });
                }
            });
        };

        var post = api('Plugins/PlaylistPermissions/TagAll', {
            method: 'POST',
            body: { OwnerUserId: ownerId, Tag: tag, Add: add }
        });

        return runWithSpinner(
            (add ? 'Adding tag to ' : 'Removing tag from ') + owned.length + ' playlist(s)…',
            post,
            'Tag ' + (add ? 'added to' : 'removed from') + ' all ' +
                owned.length + ' playlist(s).',
            optimistic
        );
    }

    function bulkGrant(owned, revoke) {
        var sel = document.getElementById('bulkTargetUser');
        if (!sel || !sel.value) return showMsg('Select a user first', false);
        var userId = sel.value;
        var userName = sel.options[sel.selectedIndex].text;

        if (revoke && !confirm(
            'Revoke edit permission for "' + userName + '" from all ' +
            owned.length + ' playlist(s)?')) return;
        if (!revoke && !confirm(
            'Grant edit permission to "' + userName + '" on all ' +
            owned.length + ' playlist(s)?')) return;

        var optimistic = function () {
            owned.forEach(function (o) {
                var p = findPlaylist(o.playlistId);
                if (!p) return;
                if (revoke) {
                    p.canEditBy = p.canEditBy.filter(function (n) {
                        return String(n).toLowerCase() !== userName.toLowerCase();
                    });
                } else if (p.canEditBy.map(function (n) { return String(n).toLowerCase(); })
                                .indexOf(userName.toLowerCase()) === -1) {
                    p.canEditBy.push(userName);
                }
            });
        };

        var requests = owned.map(function (o) {
            return api('Plugins/PlaylistPermissions/Permission', {
                method: 'POST',
                body: { TargetUserId: userId, PlaylistId: o.playlistId, Revoke: revoke }
            });
        });

        return runWithSpinner(
            (revoke ? 'Revoking edit from ' : 'Granting edit to ') +
                owned.length + ' playlist(s)…',
            Promise.all(requests),
            'Permission ' + (revoke ? 'revoked from' : 'granted to') +
                ' all ' + owned.length + ' playlist(s).',
            optimistic
        );
    }

    function bulkAccess(owned, enable) {
        if (!confirm(
            (enable ? 'Enable' : 'Disable') + ' public access on all ' +
            owned.length + ' playlist(s)?')) return;

        var optimistic = function () {
            owned.forEach(function (o) {
                var p = findPlaylist(o.playlistId);
                if (p) p.openAccess = enable;
            });
        };

        var requests = owned.map(function (o) {
            return api('Plugins/PlaylistPermissions/OpenAccess', {
                method: 'POST',
                body: { PlaylistId: o.playlistId, Enable: enable }
            });
        });

        return runWithSpinner(
            (enable ? 'Enabling' : 'Disabling') + ' public access on ' +
                owned.length + ' playlist(s)…',
            Promise.all(requests),
            'Public access ' + (enable ? 'enabled' : 'disabled') +
                ' on all ' + owned.length + ' playlist(s).',
            optimistic
        );
    }

    // --- boot -------------------------------------------------------------

    function boot() {
        if (!document.getElementById('PlaylistPermissionsPage')) return;
        var cb = document.getElementById('audioOnly');
        if (cb) cb.addEventListener('change', saveConfig);
        loadConfig().then(loadAll);
    }

    document.addEventListener('pageshow', boot);
    if (document.readyState !== 'loading') setTimeout(boot, 0);
})();
