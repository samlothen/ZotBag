import { WallabagAPI, WallabagEntry } from "./wallabagApi";
import { getPref } from "../utils/prefs";

/**
 * Save an attachment in a specific format to a Zotero item
 * @param item The Zotero item to attach the file to
 * @param data The file data as an ArrayBuffer
 * @param filename The filename for the file
 * @param contentType The content type of the file
 * @returns The created attachment item
 */
async function saveAttachment(
    item: Zotero.Item,
    data: ArrayBuffer,
    filename: string,
    contentType: string
): Promise<Zotero.Item> {
    try {
        Zotero.debug(`ZotBag: Saving ${contentType} attachment for item: ${item.getField('title')}`);

        // Create a temporary file
        const tmpFile = Zotero.getTempDirectory();
        tmpFile.append(filename);
        if (tmpFile.exists()) {
            tmpFile.remove(false);
        }

        // Write the data to the temporary file using Mozilla Components API
        // Use type assertions to avoid TypeScript errors with Mozilla-specific APIs
        const fileOutputStream = (Components.classes as any)["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Components.interfaces.nsIFileOutputStream);
        fileOutputStream.init(tmpFile, 0x02 | 0x08 | 0x20, 0o666, 0);

        // Convert ArrayBuffer to Uint8Array
        const uint8Array = new Uint8Array(data);

        // Write the data
        const binaryOutputStream = (Components.classes as any)["@mozilla.org/binaryoutputstream;1"]
            .createInstance(Components.interfaces.nsIBinaryOutputStream);
        binaryOutputStream.setOutputStream(fileOutputStream);
        binaryOutputStream.writeByteArray(uint8Array, uint8Array.length);
        binaryOutputStream.close();
        fileOutputStream.close();

        // Create the attachment
        const attachment = await Zotero.Attachments.importFromFile({
            file: tmpFile,
            parentItemID: item.id,
            title: filename,
            contentType: contentType
        });

        // Remove the temporary file
        if (tmpFile.exists()) {
            tmpFile.remove(false);
        }

        Zotero.debug(`ZotBag: Successfully saved ${contentType} attachment`);
        return attachment;
    } catch (error: any) {
        Zotero.debug(`ZotBag: Error saving ${contentType} attachment: ${error.message}`);
        throw error;
    }
}

/**
 * Save a PDF as an attachment to a Zotero item (legacy method for backward compatibility)
 * @param item The Zotero item to attach the PDF to
 * @param pdfData The PDF data as an ArrayBuffer
 * @param filename The filename for the PDF
 * @returns The created attachment item
 */
async function savePdfAttachment(
    item: Zotero.Item,
    pdfData: ArrayBuffer,
    filename: string
): Promise<Zotero.Item> {
    return saveAttachment(item, pdfData, filename, "application/pdf");
}

/**
 * Create a Zotero item from a Wallabag entry
 * @param entry The Wallabag entry to convert to a Zotero item
 * @param downloadPdf Whether to download and attach the PDF
 * @returns The created Zotero item
 */
export async function createZoteroItemFromWallabagEntry(
    entry: WallabagEntry,
    downloadPdf: boolean = false
): Promise<Zotero.Item> {
    try {
        Zotero.debug(`ZotBag: Creating Zotero item for Wallabag entry: ${entry.title}`);

        // Create a new web page item
        const item = new Zotero.Item("webpage");

        // Set basic metadata (only if not empty)
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

        // Add Wallabag ID and link to extra field
        const serverUrl = getPref("wallabag.serverUrl");
        const wallabagLink = `${serverUrl}/view/${entry.id}`;
        item.setField("extra", `${entry.id}\nWallabag Link: ${wallabagLink}`);

        // Add published_by as creators if available
        if (entry.published_by && entry.published_by.length > 0) {
            for (const author of entry.published_by) {
                if (author && author.trim()) {
                    // Use setCreator with index and creator object
                    item.setCreator(0, {
                        firstName: "",
                        lastName: author.trim(),
                        creatorType: "author"
                    });
                }
            }
        }

        // Add tags if available
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

        // Save the item first to ensure it has an ID
        await item.saveTx();

        // Add to Wallabag collection
        try {
            // Get the Wallabag collection
            const collection = await getOrCreateWallabagCollection();
            if (collection) {
                Zotero.debug(`ZotBag: Adding item ${item.id} to Wallabag collection ${collection.id}`);

                // Add the item to the collection using the recommended approach
                item.addToCollection(collection.id);
                await item.saveTx();
                Zotero.debug(`ZotBag: Added item to collection using item.addToCollection() and saved item`);
            } else {
                Zotero.debug(`ZotBag: No Wallabag collection available to add item to`);
            }
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error adding item to Wallabag collection: ${error.message}`);
            // Continue even if adding to collection fails
        }

        // Handle format downloads
        try {
            const wallabagApi = new WallabagAPI();

            // Create a safe title for filenames
            const safeTitle = entry.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

            // For backward compatibility, check the legacy downloadPdf parameter
            if (downloadPdf) {
                try {
                    const pdfData = await wallabagApi.downloadEntryAsPdf(entry.id);
                    const filename = `${safeTitle}_wallabag_${entry.id}.pdf`;
                    await savePdfAttachment(item, pdfData, filename);
                } catch (formatError: any) {
                    Zotero.debug(`ZotBag: Error attaching PDF: ${formatError.message}`);
                    // Continue without the PDF if there's an error
                }
            } else {
                // Check each format preference and download if enabled
                const formats = [
                    { format: "xml", pref: "wallabag.formats.xml", contentType: "application/xml" },
                    { format: "json", pref: "wallabag.formats.json", contentType: "application/json" },
                    { format: "txt", pref: "wallabag.formats.txt", contentType: "text/plain" },
                    { format: "csv", pref: "wallabag.formats.csv", contentType: "text/csv" },
                    { format: "pdf", pref: "wallabag.formats.pdf", contentType: "application/pdf" },
                    { format: "epub", pref: "wallabag.formats.epub", contentType: "application/epub+zip" }
                ];

                for (const { format, pref, contentType } of formats) {
                    if (getPref(pref as any)) {
                        try {
                            Zotero.debug(`ZotBag: Downloading ${format} for entry ${entry.id}`);
                            const data = await wallabagApi.downloadEntryInFormat(entry.id, format);
                            const filename = `${safeTitle}_wallabag_${entry.id}.${format}`;
                            await saveAttachment(item, data, filename, contentType);
                        } catch (formatError: any) {
                            Zotero.debug(`ZotBag: Error attaching ${format.toUpperCase()}: ${formatError.message}`);
                            // Continue with other formats if there's an error
                        }
                    }
                }
            }
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error attaching files: ${error.message}`);
            // Continue without attachments if there's an error
        }

        Zotero.debug(`ZotBag: Successfully created Zotero item for Wallabag entry: ${entry.title}`);
        return item;
    } catch (error: any) {
        Zotero.debug(`ZotBag: Error creating Zotero item: ${error.message}`);
        throw error;
    }
}

/**
 * Get or create the Wallabag collection in Zotero
 * @returns The Wallabag collection
 */
async function getOrCreateWallabagCollection(): Promise<Zotero.Collection | null> {
    try {
        // Get the current library ID
        const libraryID = Zotero.Libraries.userLibraryID;

        // Check if Wallabag collection already exists
        const collections = Zotero.Collections.getByLibrary(libraryID);
        for (const collection of collections) {
            if (collection.name === "Wallabag") {
                Zotero.debug(`ZotBag: Found existing Wallabag collection with ID ${collection.id}`);
                return collection;
            }
        }

        // Create a new Wallabag collection
        Zotero.debug(`ZotBag: Creating new Wallabag collection`);
        const collection = new Zotero.Collection();
        collection.name = "Wallabag";
        await collection.saveTx();

        Zotero.debug(`ZotBag: Created new Wallabag collection with ID ${collection.id}`);
        return collection;
    } catch (error: any) {
        Zotero.debug(`ZotBag: Error getting or creating Wallabag collection: ${error.message}`);
        return null;
    }
}
