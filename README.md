# ZotBag: Wallabag Integration for Zotero

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)

ZotBag is a Zotero plugin that integrates with [Wallabag](https://wallabag.org/), allowing you to import your saved articles from Wallabag into your Zotero library.

## Features

- **Import from Wallabag**: Import individual articles from Wallabag into Zotero with a single click
- **Automatic Synchronization**: Set up automatic syncing between Wallabag and Zotero at configurable intervals
- **Multiple Format Support**: Download and attach articles in various formats:
  - PDF
  - EPUB
  - XML
  - JSON
  - TXT
  - CSV
- **Metadata Preservation**: Maintains article metadata including:
  - Title and URL
  - Publication date
  - Authors
  - Tags
  - Starred status
- **Organized Collection**: Automatically organizes imported articles in a dedicated "Wallabag" collection in Zotero

## Requirements

- Zotero 7
- A Wallabag account (self-hosted or wallabag.it)
- Wallabag API credentials (Client ID and Client Secret)

## Installation

1. Download the latest release (.xpi file) from the [Releases page](https://github.com/samlothen/ZotBag/releases)
2. In Zotero, go to Tools → Add-ons
3. Click the gear icon and select "Install Add-on From File..."
4. Select the downloaded .xpi file
5. Restart Zotero when prompted

## Configuration

1. In Zotero, go to Edit → Preferences → ZotBag
2. Enter your Wallabag credentials:
   - Server URL (e.g., `https://app.wallabag.it` or your self-hosted instance)
   - Client ID
   - Client Secret
   - Username
   - Password
3. Click "Test Connection" to verify your credentials
4. Configure sync settings:
   - Enable automatic sync
   - Set sync interval (in minutes)
   - Select which formats to download and attach

### Getting Wallabag API Credentials

1. Log in to your Wallabag instance
2. Go to the Developer section (or API clients)
3. Create a new client to get your Client ID and Client Secret

## Usage

### Manual Import

1. In Zotero, go to Edit → Preferences → ZotBag → Import from Wallabag
2. Enter the Wallabag Entry ID (the number in the URL when viewing an article)
3. Select whether to download and attach the PDF
4. Click "Import Entry"

### Automatic Sync

Once configured, ZotBag will automatically sync with Wallabag at the specified interval. You can also:

1. Go to Edit → Preferences → ZotBag → Sync Settings
2. Click "Sync Now" to manually trigger a sync
3. Click "Reset Sync Status" to force a full sync on the next run

## License

This project is licensed under the [AGPL-3.0 License](LICENSE).

## Acknowledgments

- Built with [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
- Uses [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
