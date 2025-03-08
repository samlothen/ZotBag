import {
  BasicExampleFactory,
  HelperExampleFactory,
  KeyExampleFactory,
  PromptExampleFactory,
  UIExampleFactory,
} from "./modules/examples";
import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { WallabagAPI } from "./modules/wallabagApi";
import { createZoteroItemFromWallabagEntry } from "./modules/zoteroIntegration";
import { WallabagSync } from "./modules/wallabagSync";

// Store the WallabagSync instance globally
let wallabagSync: WallabagSync | null = null;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  BasicExampleFactory.registerPrefs();

  BasicExampleFactory.registerNotifier();

  KeyExampleFactory.registerShortcuts();

  await UIExampleFactory.registerExtraColumn();

  await UIExampleFactory.registerExtraColumnWithCustomCell();

  UIExampleFactory.registerItemPaneCustomInfoRow();

  UIExampleFactory.registerItemPaneSection();

  UIExampleFactory.registerReaderItemPaneSection();

  // Initialize Wallabag sync
  initWallabagSync();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

/**
 * Initialize the Wallabag sync functionality
 */
function initWallabagSync() {
  try {
    Zotero.debug("ZotBag: Initializing Wallabag sync");

    // Create a new WallabagSync instance
    wallabagSync = new WallabagSync();

    // Start the sync process
    wallabagSync.startSync();

    Zotero.debug("ZotBag: Wallabag sync initialized");
  } catch (error: any) {
    Zotero.debug(`ZotBag: Error initializing Wallabag sync: ${error.message}`);
  }
}

async function onMainWindowLoad(win: Window): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  // @ts-ignore This is a moz feature
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  await Zotero.Promise.delay(1000);
  popupWin.changeLine({
    progress: 30,
    text: `[30%] ${getString("startup-begin")}`,
  });

  UIExampleFactory.registerStyleSheet(win);

  UIExampleFactory.registerRightClickMenuItem();

  UIExampleFactory.registerRightClickMenuPopup(win);

  UIExampleFactory.registerWindowMenuWithSeparator();

  PromptExampleFactory.registerNormalCommandExample();

  PromptExampleFactory.registerAnonymousCommandExample(win);

  PromptExampleFactory.registerConditionalCommandExample();

  await Zotero.Promise.delay(1000);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(5000);

  addon.hooks.onDialogEvents("dialogExample");
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
  if (
    event == "select" &&
    type == "tab" &&
    extraData[ids[0]].type == "reader"
  ) {
    BasicExampleFactory.exampleNotifierCallback();
  } else {
    return;
  }
}

/**
 * This function is a dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    case "wallabag-test":
      testWallabagConnection(data.window);
      break;
    case "wallabag-import":
      importWallabagEntry(data.window);
      break;
    case "wallabag-sync-now":
      syncWallabagNow(data.window);
      break;
    case "wallabag-sync-pref-changed":
      restartWallabagSync();
      break;
    default:
      return;
  }
}

/**
 * Manually trigger a Wallabag sync
 * @param window The preferences window
 */
async function syncWallabagNow(window: Window) {
  try {
    Zotero.debug("ZotBag: Manual sync triggered");

    // Check if the sync instance exists
    if (!wallabagSync) {
      // Create a new instance if it doesn't exist
      wallabagSync = new WallabagSync();
    }

    // Run the sync with progress window
    await wallabagSync.syncWallabagEntries(true);
  } catch (error: any) {
    Zotero.debug(`ZotBag: Error in manual sync: ${error.message}`);
    new ztoolkit.ProgressWindow("Wallabag Sync", {
      closeOnClick: true,
      closeTime: 5000,
    })
      .createLine({
        text: `Error: ${error.message}`,
        type: "error",
        progress: 100,
      })
      .show();
  }
}

/**
 * Restart the Wallabag sync when preferences change
 */
function restartWallabagSync() {
  try {
    Zotero.debug("ZotBag: Restarting Wallabag sync due to preference changes");

    // Check if the sync instance exists
    if (!wallabagSync) {
      // Create a new instance if it doesn't exist
      wallabagSync = new WallabagSync();
    }

    // Restart the sync
    wallabagSync.restartSync();
  } catch (error: any) {
    Zotero.debug(`ZotBag: Error restarting sync: ${error.message}`);
  }
}

/**
 * Test the connection to the Wallabag server
 * @param window The preferences window
 */
async function testWallabagConnection(window: Window) {
  try {
    // Show a loading message
    const progressWindow = new ztoolkit.ProgressWindow("Wallabag Connection Test", {
      closeOnClick: false,
      closeTime: -1,
    })
      .createLine({
        text: "Testing connection to Wallabag server...",
        type: "default",
        progress: 50,
      })
      .show();

    // Test the connection
    const wallabagApi = new WallabagAPI();
    const result = await wallabagApi.testConnection();

    // Update the progress window with the result
    if (result.success) {
      progressWindow.changeLine({
        text: result.message,
        type: "success",
        progress: 100,
      });
    } else {
      progressWindow.changeLine({
        text: result.message,
        type: "error",
        progress: 100,
      });
    }

    // Close the progress window after 5 seconds
    progressWindow.startCloseTimer(5000);
  } catch (error: any) {
    Zotero.debug(`ZotBag: Error in test connection handler: ${error.message}`);
    new ztoolkit.ProgressWindow("Wallabag Connection Test", {
      closeOnClick: true,
      closeTime: 5000,
    })
      .createLine({
        text: `Error: ${error.message}`,
        type: "error",
        progress: 100,
      })
      .show();
  }
}

/**
 * Import an entry from Wallabag and create a Zotero item
 * @param window The preferences window
 */
async function importWallabagEntry(window: Window) {
  try {
    // Get the entry ID from the input field
    const entryIdInput = window.document.getElementById(
      `zotero-prefpane-${addon.data.config.addonRef}-wallabag-entryId`
    ) as HTMLInputElement;

    const entryId = parseInt(entryIdInput.value.trim());

    if (isNaN(entryId) || entryId <= 0) {
      throw new Error("Please enter a valid entry ID");
    }

    // Get the PDF download checkbox state
    const downloadPdfCheckbox = window.document.getElementById(
      `zotero-prefpane-${addon.data.config.addonRef}-wallabag-downloadPdf`
    ) as HTMLInputElement;

    const downloadPdf = downloadPdfCheckbox?.checked || false;

    // Show a loading message
    const progressWindow = new ztoolkit.ProgressWindow("Wallabag Import", {
      closeOnClick: false,
      closeTime: -1,
    })
      .createLine({
        text: `Importing entry ${entryId} from Wallabag...${downloadPdf ? " (with PDF)" : ""}`,
        type: "default",
        progress: 50,
      })
      .show();

    // Fetch the entry
    const wallabagApi = new WallabagAPI();
    const entry = await wallabagApi.getEntry(entryId);

    // Create a Zotero item from the entry
    const item = await createZoteroItemFromWallabagEntry(entry, downloadPdf);

    // Update the progress window with success
    progressWindow.changeLine({
      text: `Successfully imported "${entry.title}"${downloadPdf ? " with PDF" : ""}`,
      type: "success",
      progress: 100,
    });

    // Clear the input field
    entryIdInput.value = "";

    // Close the progress window after 5 seconds
    progressWindow.startCloseTimer(5000);
  } catch (error: any) {
    Zotero.debug(`ZotBag: Error in import entry handler: ${error.message}`);
    new ztoolkit.ProgressWindow("Wallabag Import", {
      closeOnClick: true,
      closeTime: 5000,
    })
      .createLine({
        text: `Error: ${error.message}`,
        type: "error",
        progress: 100,
      })
      .show();
  }
}

function onShortcuts(type: string) {
  switch (type) {
    case "larger":
      KeyExampleFactory.exampleShortcutLargerCallback();
      break;
    case "smaller":
      KeyExampleFactory.exampleShortcutSmallerCallback();
      break;
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    case "dialogExample":
      HelperExampleFactory.dialogExample();
      break;
    case "clipboardExample":
      HelperExampleFactory.clipboardExample();
      break;
    case "filePickerExample":
      HelperExampleFactory.filePickerExample();
      break;
    case "progressWindowExample":
      HelperExampleFactory.progressWindowExample();
      break;
    case "vtableExample":
      HelperExampleFactory.vtableExample();
      break;
    default:
      break;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
