# Thymer filtered views (collection plugin)

**Version:** 1.0.0 (see `package.json`)

A Thymer **collection plugin** that adds a **Views** control to the collection panel. It opens a modal to **create, edit, and delete** filtered views for that collection by updating the collection configuration (same ideas as Thymer’s native views: type, query, sort, visible columns, board group-by).

## Requirements

- Collection config: **`managed.views: false`** so the plugin can add and update views programmatically.
- **Tabler Icons** (`ti-*` classes) for the nav icon, modal chrome, and chevrons — your Thymer theme or app should already load Tabler; if icons are missing, add the Tabler webfont/CSS the way other collection plugins do.

## What the plugin does

- **Navigation:** **Views** (filter icon) in the collection nav opens the modal.
- **Manage:** Lists views whose id starts with **`viewfv`**. Those rows can be edited (pencil) or deleted (trash). Built-in views and views from `plugin.json` keep other ids and are not offered for delete by this plugin.
- **Create / edit:** Form for label, optional **copy from existing view**, **view type** (table, board, gallery, calendar), **filter query** (search-bar-style syntax), **sort**, **group by** (board only), and **visible fields** (checkboxes per active field).
- **Persistence:** Reads/writes `collection.getConfiguration()` / `saveConfiguration()`. Plugin-created view ids are also tracked under **`custom.fvCreatedIds`** (`fvCreatedIds`).

## UI details

- **Insert filter elements:** Below the filter query, a **collapsible** panel (chevron toggle, **collapsed by default**) opens the **cheatsheet** (`tk-fv-cheatsheet`): click-to-insert pills for common `@` keywords and per-field / choice tokens.
- **Visible fields:** The field checkbox list is in a **collapsible** panel (**collapsed by default**) with summary **“Select visible fields”** and the same chevron pattern. All active fields stay selected by default when the user expands and does not change checks.

Close the modal with **Close**, the × control, **Escape**, or a click on the backdrop.

## Files

| File | Role |
|------|------|
| `collectionplugin.js` | `CollectionPlugin` implementation: modal, cheatsheet, save/load views |
| `package.json` | Package name and version |

## Installation

Install as a **collection plugin** in Thymer: attach this repo’s `collectionplugin.js` (or your bundle) per Thymer’s docs for custom collection code. Ensure the collection has **`managed.views: false`** if you rely on this plugin to manage filtered views.
