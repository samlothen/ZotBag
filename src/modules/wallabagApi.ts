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
