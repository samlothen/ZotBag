/* eslint-disable no-undef */
pref("enable", true);
pref("input", "This is input");
// Wallabag settings
pref("wallabag.serverUrl", "");
pref("wallabag.clientId", "");
pref("wallabag.clientSecret", "");
pref("wallabag.username", "");
pref("wallabag.password", "");
// Sync settings
pref("wallabag.sync.enabled", false);
pref("wallabag.sync.interval", 60); // in minutes
pref("wallabag.sync.lastTimestamp", 0); // Unix timestamp of last sync
pref("wallabag.sync.downloadPdf", true); // Download PDF when syncing (legacy, kept for backward compatibility)

// Format settings
pref("wallabag.formats.xml", false);
pref("wallabag.formats.json", false);
pref("wallabag.formats.txt", false);
pref("wallabag.formats.csv", false);
pref("wallabag.formats.pdf", true); // Default to true for backward compatibility
pref("wallabag.formats.epub", false);
