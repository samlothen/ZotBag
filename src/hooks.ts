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

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
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
 * This function is just an example of dispatcher for Preference UI events.
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
    default:
      return;
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

    // Show a loading message
    const progressWindow = new ztoolkit.ProgressWindow("Wallabag Import", {
      closeOnClick: false,
      closeTime: -1,
    })
      .createLine({
        text: `Importing entry ${entryId} from Wallabag...`,
        type: "default",
        progress: 50,
      })
      .show();

    // Fetch the entry
    const wallabagApi = new WallabagAPI();
    const entry = await wallabagApi.getEntry(entryId);

    // Create a Zotero item from the entry
    const item = await createZoteroItemFromWallabagEntry(entry);

    // Update the progress window with success
    progressWindow.changeLine({
      text: `Successfully imported "${entry.title}"`,
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
