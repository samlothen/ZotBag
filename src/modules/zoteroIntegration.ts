import { WallabagEntry } from "./wallabagApi";
import { getPref } from "../utils/prefs";

/**
 * Create a Zotero item from a Wallabag entry
 * @param entry The Wallabag entry to convert to a Zotero item
 * @returns The created Zotero item
 */
export async function createZoteroItemFromWallabagEntry(entry: WallabagEntry): Promise<Zotero.Item> {
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
        }

        // Set domain_name as website if available
        if (entry.domain_name) {
            item.setField("websiteTitle", entry.domain_name);
        }

        // Add Wallabag link to extra field
        const serverUrl = getPref("wallabag.serverUrl");
        const wallabagLink = `${serverUrl}/view/${entry.id}`;
        item.setField("extra", `Wallabag Link: ${wallabagLink}`);

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

        // Add to Wallabag collection
        const collection = await getOrCreateWallabagCollection();
        if (collection) {
            collection.addItem(item.id);
        }

        // Save the item
        await item.saveTx();

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
                return collection;
            }
        }

        // Create a new Wallabag collection
        const collection = new Zotero.Collection();
        collection.name = "Wallabag";
        collection.save();

        return collection;
    } catch (error: any) {
        Zotero.debug(`ZotBag: Error getting or creating Wallabag collection: ${error.message}`);
        return null;
    }
}
