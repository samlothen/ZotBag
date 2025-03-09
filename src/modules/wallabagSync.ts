import { getPref, setPref } from "../utils/prefs";
import { WallabagAPI, WallabagEntry } from "./wallabagApi";
import { createZoteroItemFromWallabagEntry } from "./zoteroIntegration";

/**
 * Class to handle synchronization between Wallabag and Zotero
 */
export class WallabagSync {
    private wallabagApi: WallabagAPI;
    private syncTimer: number | null = null;
    private syncInProgress: boolean = false;

    constructor() {
        this.wallabagApi = new WallabagAPI();
    }

    /**
     * Check if a sync is currently in progress
     * @returns True if a sync is in progress, false otherwise
     */
    isSyncInProgress(): boolean {
        return this.syncInProgress;
    }

    /**
     * Start the sync process based on user preferences
     */
    startSync(): void {
        // Clear any existing timer
        this.stopSync();

        // Check if sync is enabled
        const syncEnabled = getPref("wallabag.sync.enabled");
        if (!syncEnabled) {
            Zotero.debug("ZotBag: Sync is disabled, not starting sync timer");
            return;
        }

        // Get sync interval in minutes
        const syncIntervalMinutes = getPref("wallabag.sync.interval");
        if (!syncIntervalMinutes || syncIntervalMinutes < 5) {
            Zotero.debug("ZotBag: Invalid sync interval, not starting sync timer");
            return;
        }

        // Convert minutes to milliseconds
        const syncIntervalMs = syncIntervalMinutes * 60 * 1000;

        // Schedule the sync
        Zotero.debug(`ZotBag: Starting sync timer with interval of ${syncIntervalMinutes} minutes`);
        this.syncTimer = window.setInterval(() => {
            this.syncWallabagEntries()
                .catch(error => {
                    Zotero.debug(`ZotBag: Error during scheduled sync: ${error.message}`);
                });
        }, syncIntervalMs);

        // Run an initial sync
        this.syncWallabagEntries()
            .catch(error => {
                Zotero.debug(`ZotBag: Error during initial sync: ${error.message}`);
            });
    }

    /**
     * Stop the sync process
     */
    stopSync(): void {
        if (this.syncTimer !== null) {
            Zotero.debug("ZotBag: Stopping sync timer");
            window.clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    /**
     * Restart the sync process (useful when preferences change)
     */
    restartSync(): void {
        this.stopSync();
        this.startSync();
    }

    /**
     * Synchronize Wallabag entries with Zotero
     * @param showProgress Whether to show a progress window
     * @returns A promise that resolves when the sync is complete, or null if a sync is already in progress
     */
    async syncWallabagEntries(showProgress: boolean = true): Promise<{ added: number; updated: number; errors: number } | null> {
        // Check if a sync is already in progress
        if (this.syncInProgress) {
            Zotero.debug("ZotBag: Sync already in progress, skipping");
            if (showProgress) {
                // Show a notification to the user
                new ztoolkit.ProgressWindow("Wallabag Sync", {
                    closeOnClick: true,
                    closeTime: 3000
                })
                    .createLine({
                        text: "A sync is already in progress",
                        type: "default",
                        progress: 100
                    })
                    .show();
            }
            return null;
        }

        // Set the flag to indicate a sync is in progress
        this.syncInProgress = true;

        try {
            Zotero.debug("ZotBag: Starting Wallabag sync");

            // Create a progress window if requested
            // Use any type to work around TypeScript errors
            let progressWindow: any = null;
            let progressLine: any = null;

            if (showProgress) {
                // Create progress window
                progressWindow = new ztoolkit.ProgressWindow("Wallabag Sync", {
                    closeOnClick: false,
                    closeTime: -1
                });

                // Create progress line
                progressLine = progressWindow.createLine({
                    text: "Connecting to Wallabag...",
                    type: "default",
                    progress: 0
                });

                // Show the window
                progressWindow.show();
            }

            // Get the last sync timestamp
            let lastSyncTimestamp = getPref("wallabag.sync.lastTimestamp");
            const isFirstSync = lastSyncTimestamp === 0;

            // Update progress window
            if (showProgress && progressWindow) {
                progressWindow.changeLine({
                    text: `Fetching ${isFirstSync ? "all" : "new"} entries from Wallabag...`,
                    progress: 10
                });
            }

            // Fetch entries from Wallabag
            const entries = await this.wallabagApi.getAllEntries(
                isFirstSync ? undefined : lastSyncTimestamp,
                showProgress && progressWindow ? (current, total) => {
                    // Calculate progress percentage (10-50%)
                    const fetchProgress = 10 + Math.floor((current / total) * 40);
                    progressWindow.changeLine({
                        text: `Fetching entries from Wallabag (${current}/${total})...`,
                        progress: fetchProgress
                    });
                } : undefined
            );

            // Update progress window
            if (showProgress && progressWindow) {
                progressWindow.changeLine({
                    text: `Processing ${entries.length} entries...`,
                    progress: 50
                });
            }

            // Get the download PDF preference
            const downloadPdf = getPref("wallabag.sync.downloadPdf");

            // Process entries
            const result = await this.processEntries(entries, downloadPdf, (current, total) => {
                if (showProgress && progressWindow) {
                    // Calculate progress percentage (50-90%)
                    const processProgress = 50 + Math.floor((current / total) * 40);
                    progressWindow.changeLine({
                        text: `Processing entries (${current}/${total})...`,
                        progress: processProgress
                    });
                }
            });

            // Update the last sync timestamp to now
            const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
            setPref("wallabag.sync.lastTimestamp", now);

            // Update progress window with results
            if (showProgress && progressWindow) {
                progressWindow.changeLine({
                    text: `Sync complete: ${result.added} added, ${result.updated} updated, ${result.errors} errors`,
                    progress: 100,
                    type: result.errors > 0 ? "error" : "success"
                });

                // Close the progress window after 5 seconds
                progressWindow.startCloseTimer(5000);
            }

            Zotero.debug(`ZotBag: Sync complete: ${result.added} added, ${result.updated} updated, ${result.errors} errors`);
            return result;
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error during sync: ${error.message}`);

            // Show error in progress window
            if (showProgress) {
                const progressWindow = new ztoolkit.ProgressWindow("Wallabag Sync", {
                    closeOnClick: true,
                    closeTime: 5000
                });

                progressWindow.createLine({
                    text: `Error: ${error.message}`,
                    type: "error",
                    progress: 100
                });

                progressWindow.show();
            }

            throw error;
        }
    }

    /**
     * Process Wallabag entries and create or update Zotero items
     * @param entries The entries to process
     * @param downloadPdf Whether to download and attach PDFs
     * @param progressCallback Optional callback function to report progress
     * @returns Statistics about the processing
     */
    private async processEntries(
        entries: WallabagEntry[],
        downloadPdf: boolean,
        progressCallback?: (current: number, total: number) => void
    ): Promise<{ added: number; updated: number; errors: number }> {
        // Initialize counters
        let added = 0;
        let updated = 0;
        let errors = 0;

        // Get the Zotero library ID
        const libraryID = Zotero.Libraries.userLibraryID;

        // Process each entry
        for (let i = 0; i < entries.length; i++) {
            try {
                const entry = entries[i];

                // Report progress
                if (progressCallback) {
                    progressCallback(i + 1, entries.length);
                }

                // Check if this entry already exists in Zotero
                const existingItems = await this.findExistingZoteroItems(entry.id, libraryID);

                if (existingItems.length > 0) {
                    // Entry exists, update it
                    await this.updateZoteroItem(existingItems[0], entry, downloadPdf);
                    updated++;
                } else {
                    // Entry doesn't exist, create it
                    await createZoteroItemFromWallabagEntry(entry, downloadPdf);
                    added++;
                }
            } catch (error: any) {
                Zotero.debug(`ZotBag: Error processing entry: ${error.message}`);
                errors++;
            }
        }

        return { added, updated, errors };
    }

    /**
     * Find existing Zotero items that correspond to a Wallabag entry
     * @param entryId The Wallabag entry ID
     * @param libraryID The Zotero library ID
     * @returns An array of matching Zotero items
     */
    private async findExistingZoteroItems(entryId: number, libraryID: number): Promise<Zotero.Item[]> {
        // Search for items with the Wallabag entry ID in the extra field
        const search = new Zotero.Search();
        search.addCondition("libraryID", "is", libraryID.toString());
        search.addCondition("note", "doesNotContain", ""); // Exclude notes
        search.addCondition("extra", "contains", `Wallabag ID: ${entryId}`);
        const itemIDs = await search.search();

        // Get the items
        return await Zotero.Items.getAsync(itemIDs);
    }

    /**
     * Update an existing Zotero item with data from a Wallabag entry
     * @param item The Zotero item to update
     * @param entry The Wallabag entry with updated data
     * @param downloadPdf Whether to download and attach a PDF
     */
    private async updateZoteroItem(item: Zotero.Item, entry: WallabagEntry, downloadPdf: boolean): Promise<void> {
        try {
            Zotero.debug(`ZotBag: Updating Zotero item for Wallabag entry: ${entry.title}`);

            // Update basic metadata (only if not empty)
            if (entry.title) item.setField("title", entry.title);
            if (entry.url) item.setField("url", entry.url);

            // Set created_at as date if available
            if (entry.created_at) {
                const date = new Date(entry.created_at);
                item.setField("date", date.toISOString().split("T")[0]);

                // Set the dateAdded property to the created_at value
                // Zotero expects dateAdded as an ISO string
                item.dateAdded = date.toISOString();
            }

            // Set domain_name as website if available
            if (entry.domain_name) {
                item.setField("websiteTitle", entry.domain_name);
            }

            // Set the Wallabag ID as the short title for sorting
            item.setField("shortTitle", `${entry.id}`);

            // Update the extra field to ensure it contains the Wallabag ID and link
            let extra = item.getField("extra") as string;
            const serverUrl = getPref("wallabag.serverUrl");
            const wallabagLink = `${serverUrl}/view/${entry.id}`;

            // Make sure the extra field contains the Wallabag ID
            if (!extra.includes(`Wallabag ID: ${entry.id}`)) {
                extra += `\nWallabag ID: ${entry.id}`;
            }

            // Make sure the extra field contains the Wallabag link
            if (!extra.includes(`Wallabag Link: ${wallabagLink}`)) {
                extra += `\nWallabag Link: ${wallabagLink}`;
            }

            // Remove any wallabag-id entries that might exist from previous versions
            extra = extra.replace(/wallabag-id: \d+\n?/g, '');

            item.setField("extra", extra.trim());

            // Update creators if available
            if (entry.published_by && entry.published_by.length > 0) {
                // Remove existing creators
                item.setCreators([]);

                // Add new creators
                for (let i = 0; i < entry.published_by.length; i++) {
                    const author = entry.published_by[i];
                    if (author && author.trim()) {
                        item.setCreator(i, {
                            firstName: "",
                            lastName: author.trim(),
                            creatorType: "author"
                        });
                    }
                }
            }

            // Update tags
            // First remove all existing tags
            const itemTags = item.getTags();
            for (const tag of itemTags) {
                item.removeTag(tag.tag);
            }

            // Add tags from the entry
            if (entry.tags && entry.tags.length > 0) {
                for (const tag of entry.tags) {
                    if (tag && tag.label) {
                        item.addTag(tag.label);
                    }
                }
            }

            // Add starred status as a tag if starred
            if (entry.is_starred === 1) {
                item.addTag("Starred");
            }

            // Save the item
            await item.saveTx();

            // If downloadPdf is true and the item doesn't already have a PDF attachment, fetch and attach the PDF
            if (downloadPdf) {
                // Check if the item already has a PDF attachment
                const attachments = await Zotero.Items.getAsync(item.getAttachments());
                const hasPdf = attachments.some(attachment => {
                    const contentType = attachment.getField("contentType");
                    return contentType === "application/pdf";
                });

                if (!hasPdf) {
                    try {
                        // Download the PDF
                        const pdfData = await this.wallabagApi.downloadEntryAsPdf(entry.id);

                        // Create a filename based on the entry title
                        const safeTitle = entry.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
                        const filename = `${safeTitle}_wallabag_${entry.id}.pdf`;

                        // Create a temporary file
                        const tmpFile = Zotero.getTempDirectory();
                        tmpFile.append(filename);
                        if (tmpFile.exists()) {
                            tmpFile.remove(false);
                        }

                        // Write the PDF data to the temporary file
                        const fileOutputStream = (Components.classes as any)["@mozilla.org/network/file-output-stream;1"]
                            .createInstance(Components.interfaces.nsIFileOutputStream);
                        fileOutputStream.init(tmpFile, 0x02 | 0x08 | 0x20, 0o666, 0);

                        // Convert ArrayBuffer to Uint8Array
                        const uint8Array = new Uint8Array(pdfData);

                        // Write the data
                        const binaryOutputStream = (Components.classes as any)["@mozilla.org/binaryoutputstream;1"]
                            .createInstance(Components.interfaces.nsIBinaryOutputStream);
                        binaryOutputStream.setOutputStream(fileOutputStream);
                        binaryOutputStream.writeByteArray(uint8Array, uint8Array.length);
                        binaryOutputStream.close();
                        fileOutputStream.close();

                        // Create the attachment
                        await Zotero.Attachments.importFromFile({
                            file: tmpFile,
                            parentItemID: item.id,
                            title: filename
                        });

                        // Remove the temporary file
                        if (tmpFile.exists()) {
                            tmpFile.remove(false);
                        }
                    } catch (error: any) {
                        Zotero.debug(`ZotBag: Error attaching PDF: ${error.message}`);
                        // Continue without the PDF if there's an error
                    }
                }
            }

            Zotero.debug(`ZotBag: Successfully updated Zotero item for Wallabag entry: ${entry.title}`);
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error updating Zotero item: ${error.message}`);
            throw error;
        }
    }
}
