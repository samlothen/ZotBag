import { getPref } from "../utils/prefs";

interface TokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string | null;
    token_type: string;
}

export interface WallabagEntry {
    is_archived: number;
    is_starred: number;
    user_name: string;
    user_email: string;
    user_id: number;
    tags: any[];
    is_public: boolean;
    id: number;
    uid: string | null;
    title: string;
    url: string;
    hashed_url: string;
    origin_url: string | null;
    given_url: string;
    hashed_given_url: string;
    archived_at: string | null;
    content: string;
    created_at: string;
    updated_at: string;
    published_at: string | null;
    published_by: string[];
    starred_at: string | null;
    annotations: any[];
    mimetype: string | null;
    language: string | null;
    reading_time: number;
    domain_name: string;
    preview_picture: string | null;
    http_status: string | null;
    headers: string | null;
    _links: {
        self: {
            href: string;
        };
    };
}

export interface EntriesResponse {
    page: number;
    limit: number;
    pages: number;
    total: number;
    _links: {
        self: {
            href: string;
        };
        first: {
            href: string;
        };
        last: {
            href: string;
        };
        next?: {
            href: string;
        };
    };
    _embedded: {
        items: WallabagEntry[];
    };
}

export class WallabagAPI {
    private serverUrl: string;
    private clientId: string;
    private clientSecret: string;
    private username: string;
    private password: string;

    constructor() {
        this.serverUrl = getPref("wallabag.serverUrl");
        this.clientId = getPref("wallabag.clientId");
        this.clientSecret = getPref("wallabag.clientSecret");
        this.username = getPref("wallabag.username");
        this.password = getPref("wallabag.password");
    }

    /**
     * Get an access token from the Wallabag server
     */
    private async getAccessToken(): Promise<string> {
        try {
            Zotero.debug("ZotBag: Requesting access token from Wallabag server");

            const url = `${this.serverUrl}/oauth/v2/token`;
            const params = new URLSearchParams({
                grant_type: "password",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                username: this.username,
                password: this.password
            });

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: params.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                Zotero.debug(`ZotBag: Failed to get access token. Status: ${response.status}, Response: ${errorText}`);
                throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const tokenResponse = data as unknown as TokenResponse;
            Zotero.debug("ZotBag: Successfully obtained access token");
            return tokenResponse.access_token;
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error getting access token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a single entry from the Wallabag server by ID
     * @param entryId The ID of the entry to fetch
     */
    async getEntry(entryId: number): Promise<WallabagEntry> {
        try {
            Zotero.debug(`ZotBag: Fetching entry with ID ${entryId}`);

            // Validate that all required fields are filled
            if (!this.serverUrl || !this.clientId || !this.clientSecret || !this.username || !this.password) {
                Zotero.debug("ZotBag: Missing required credentials for Wallabag connection");
                throw new Error("Please fill in all Wallabag credentials in the settings");
            }

            // Get access token
            const accessToken = await this.getAccessToken();

            // Fetch the entry
            const entryUrl = `${this.serverUrl}/api/entries/${entryId}`;
            const response = await fetch(entryUrl, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                Zotero.debug(`ZotBag: Failed to fetch entry. Status: ${response.status}, Response: ${errorText}`);
                throw new Error(`Failed to fetch entry: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const entry = data as unknown as WallabagEntry;
            Zotero.debug(`ZotBag: Successfully fetched entry: ${entry.title}`);
            return entry;
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error fetching entry: ${error.message}`);
            throw error;
        }
    }

    /**
     * Download an entry as PDF from the Wallabag server
     * @param entryId The ID of the entry to download
     * @returns The PDF data as an ArrayBuffer
     */
    async downloadEntryAsPdf(entryId: number): Promise<ArrayBuffer> {
        try {
            Zotero.debug(`ZotBag: Downloading PDF for entry with ID ${entryId}`);

            // Validate that all required fields are filled
            if (!this.serverUrl || !this.clientId || !this.clientSecret || !this.username || !this.password) {
                Zotero.debug("ZotBag: Missing required credentials for Wallabag connection");
                throw new Error("Please fill in all Wallabag credentials in the settings");
            }

            // Get access token
            const accessToken = await this.getAccessToken();

            // Fetch the PDF
            const pdfUrl = `${this.serverUrl}/api/entries/${entryId}/export.pdf`;
            const response = await fetch(pdfUrl, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                Zotero.debug(`ZotBag: Failed to download PDF. Status: ${response.status}, Response: ${errorText}`);
                throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
            }

            // Return the PDF data as ArrayBuffer
            return await response.arrayBuffer();
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error downloading PDF: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get entries from the Wallabag server with pagination
     * @param since Optional timestamp to filter entries updated since a specific time
     * @param page Page number to fetch (starting from 1)
     * @param perPage Number of entries per page (default: 30)
     * @returns A page of entries
     */
    async getEntries(since?: number, page: number = 1, perPage: number = 30): Promise<EntriesResponse> {
        try {
            Zotero.debug(`ZotBag: Fetching entries page ${page} (since: ${since || 'all'})`);

            // Validate that all required fields are filled
            if (!this.serverUrl || !this.clientId || !this.clientSecret || !this.username || !this.password) {
                Zotero.debug("ZotBag: Missing required credentials for Wallabag connection");
                throw new Error("Please fill in all Wallabag credentials in the settings");
            }

            // Get access token
            const accessToken = await this.getAccessToken();

            // Build the URL with query parameters
            const params = new URLSearchParams({
                page: page.toString(),
                perPage: perPage.toString(),
                sort: "updated", // Sort by update date
                order: "desc", // Most recent first
                detail: "full" // Include full content
            });

            // Add since parameter if provided
            if (since) {
                params.append("since", since.toString());
            }

            // Fetch the entries
            const entriesUrl = `${this.serverUrl}/api/entries?${params.toString()}`;
            const response = await fetch(entriesUrl, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                Zotero.debug(`ZotBag: Failed to fetch entries. Status: ${response.status}, Response: ${errorText}`);
                throw new Error(`Failed to fetch entries: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const entriesResponse = data as unknown as EntriesResponse;
            Zotero.debug(`ZotBag: Successfully fetched ${entriesResponse._embedded.items.length} entries (page ${entriesResponse.page} of ${entriesResponse.pages})`);
            return entriesResponse;
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error fetching entries: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all entries from the Wallabag server by fetching all pages
     * @param since Optional timestamp to filter entries updated since a specific time
     * @param progressCallback Optional callback function to report progress
     * @returns All entries matching the criteria
     */
    async getAllEntries(
        since?: number,
        progressCallback?: (current: number, total: number) => void
    ): Promise<WallabagEntry[]> {
        try {
            Zotero.debug(`ZotBag: Fetching all entries (since: ${since || 'all'})`);

            // Get the first page to determine total pages
            const firstPage = await this.getEntries(since, 1);
            const totalPages = firstPage.pages;
            const totalEntries = firstPage.total;

            // Initialize the result with the first page items
            let allEntries = [...firstPage._embedded.items];

            // Report initial progress
            if (progressCallback) {
                progressCallback(allEntries.length, totalEntries);
            }

            // Fetch remaining pages if any
            if (totalPages > 1) {
                // Create an array of page numbers to fetch (starting from 2)
                const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

                // Fetch pages sequentially to avoid overwhelming the server
                for (const pageNum of remainingPages) {
                    const pageData = await this.getEntries(since, pageNum);
                    allEntries = [...allEntries, ...pageData._embedded.items];

                    // Report progress
                    if (progressCallback) {
                        progressCallback(allEntries.length, totalEntries);
                    }
                }
            }

            Zotero.debug(`ZotBag: Successfully fetched all ${allEntries.length} entries`);
            return allEntries;
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error fetching all entries: ${error.message}`);
            throw error;
        }
    }

    /**
     * Test the connection to the Wallabag server
     */
    async testConnection(): Promise<{ success: boolean; message: string; info?: any }> {
        try {
            Zotero.debug("ZotBag: Testing connection to Wallabag server");

            // Validate that all required fields are filled
            if (!this.serverUrl || !this.clientId || !this.clientSecret || !this.username || !this.password) {
                Zotero.debug("ZotBag: Missing required credentials for Wallabag connection");
                return {
                    success: false,
                    message: "Please fill in all Wallabag credentials"
                };
            }

            // First, get an access token
            const accessToken = await this.getAccessToken();

            // Then, test the API by calling the info endpoint
            const infoUrl = `${this.serverUrl}/api/info`;
            const infoResponse = await fetch(infoUrl, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            if (!infoResponse.ok) {
                const errorText = await infoResponse.text();
                Zotero.debug(`ZotBag: Failed to get server info. Status: ${infoResponse.status}, Response: ${errorText}`);
                return {
                    success: false,
                    message: `Failed to connect to Wallabag server: ${infoResponse.status} ${infoResponse.statusText}`
                };
            }

            const info = await infoResponse.json();
            const serverInfo = info as unknown as { appname: string; version: string; allowed_registration: boolean };
            Zotero.debug(`ZotBag: Successfully connected to Wallabag server. Version: ${serverInfo.version}`);

            return {
                success: true,
                message: `Successfully connected to Wallabag server (${serverInfo.appname} v${serverInfo.version})`,
                info: serverInfo
            };
        } catch (error: any) {
            Zotero.debug(`ZotBag: Error testing connection: ${error.message}`);
            return {
                success: false,
                message: `Error connecting to Wallabag: ${error.message}`
            };
        }
    }
}
