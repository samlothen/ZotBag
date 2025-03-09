import { config } from "../../package.json";
import { getString } from "../utils/locale";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [
        {
          dataKey: "title",
          label: getString("prefs-table-title"),
          fixedWidth: true,
          width: 100,
        },
        {
          dataKey: "detail",
          label: getString("prefs-table-detail"),
        },
      ],
      rows: [
        {
          title: "Orange",
          detail: "It's juicy",
        },
        {
          title: "Banana",
          detail: "It's sweet",
        },
        {
          title: "Apple",
          detail: "I mean the fruit APPLE",
        },
      ],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  updatePrefsUI();
  bindPrefEvents();
}

async function updatePrefsUI() {
  // You can initialize some UI elements on prefs window
  // with addon.data.prefs.window.document
  // Or bind some events to the elements
  const renderLock = ztoolkit.getGlobal("Zotero").Promise.defer();
  if (addon.data.prefs?.window == undefined) return;
  const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
    .setContainerId(`${config.addonRef}-table-container`)
    .setProp({
      id: `${config.addonRef}-prefs-table`,
      // Do not use setLocale, as it modifies the Zotero.Intl.strings
      // Set locales directly to columns
      columns: addon.data.prefs?.columns,
      showHeader: true,
      multiSelect: true,
      staticColumns: true,
      disableFontSizeScaling: true,
    })
    .setProp("getRowCount", () => addon.data.prefs?.rows.length || 0)
    .setProp(
      "getRowData",
      (index) =>
        addon.data.prefs?.rows[index] || {
          title: "no data",
          detail: "no data",
        },
    )
    // Show a progress window when selection changes
    .setProp("onSelectionChange", (selection) => {
      new ztoolkit.ProgressWindow(config.addonName)
        .createLine({
          text: `Selected line: ${addon.data.prefs?.rows
            .filter((v, i) => selection.isSelected(i))
            .map((row) => row.title)
            .join(",")}`,
          progress: 100,
        })
        .show();
    })
    // When pressing delete, delete selected line and refresh table.
    // Returning false to prevent default event.
    .setProp("onKeyDown", (event: KeyboardEvent) => {
      if (event.key == "Delete" || (Zotero.isMac && event.key == "Backspace")) {
        addon.data.prefs!.rows =
          addon.data.prefs?.rows.filter(
            (v, i) => !tableHelper.treeInstance.selection.isSelected(i),
          ) || [];
        tableHelper.render();
        return false;
      }
      return true;
    })
    // For find-as-you-type
    .setProp(
      "getRowString",
      (index) => addon.data.prefs?.rows[index].title || "",
    )
    // Render the table.
    .render(-1, () => {
      renderLock.resolve();
    });
  await renderLock.promise;
  ztoolkit.log("Preference table rendered!");
}

function bindPrefEvents() {
  // Example event listeners
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-enable`,
    )
    ?.addEventListener("command", (e) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as XUL.Checkbox).checked}!`,
      );
    });

  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-input`,
    )
    ?.addEventListener("change", (e) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as HTMLInputElement).value}!`,
      );
    });

  // Wallabag sync preferences event listeners
  // Sync enabled checkbox
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-wallabag-sync-enabled`,
    )
    ?.addEventListener("command", (e) => {
      ztoolkit.log("Wallabag sync enabled changed", e);
      // Notify that sync preferences have changed
      addon.hooks.onPrefsEvent("wallabag-sync-pref-changed", {});
    });

  // Sync interval input
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-wallabag-sync-interval`,
    )
    ?.addEventListener("change", (e) => {
      ztoolkit.log("Wallabag sync interval changed", e);
      // Notify that sync preferences have changed
      addon.hooks.onPrefsEvent("wallabag-sync-pref-changed", {});
    });

  // Sync download PDF checkbox
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-wallabag-sync-downloadPdf`,
    )
    ?.addEventListener("command", (e) => {
      ztoolkit.log("Wallabag sync download PDF changed", e);
      // Notify that sync preferences have changed
      addon.hooks.onPrefsEvent("wallabag-sync-pref-changed", {});
    });

  // Sync now button
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-wallabag-sync-now`,
    )
    ?.addEventListener("command", (e) => {
      ztoolkit.log("Wallabag sync now button clicked", e);
      // Trigger manual sync
      addon.hooks.onPrefsEvent("wallabag-sync-now", { window: addon.data.prefs!.window });
    });

  // Reset sync status button
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-wallabag-sync-reset`,
    )
    ?.addEventListener("command", (e) => {
      ztoolkit.log("Wallabag reset sync status button clicked", e);
      // Trigger sync status reset
      addon.hooks.onPrefsEvent("wallabag-sync-reset", { window: addon.data.prefs!.window });
    });
}
