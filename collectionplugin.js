// =============================================================================
// Filtered Views v.1.0.1
// -----------------------------------------------------------------------------
// Collection panel nav button opens a modal to create, edit, and delete
// filtered views. Persists via this.collection.getConfiguration() /
// saveConfiguration() (requires managed.views: false on the collection).
//
// Manage list: shows views whose id is listed in custom.fvCreatedIds OR whose
// id starts with prefix "viewfv" (alphanumeric only — Thymer sanitizes view
// ids). Each row: edit (loads the form) or delete (inline confirm). Other
// views (e.g. from plugin.json or native UI) are not listed here.
//
// Form: label; optional copy-from-existing-view; type (table / board / gallery
// / calendar); filter query with collapsible "Insert filter elements"
// cheatsheet; group-by when type is board; sort field + direction; collapsible
// visible-field checkboxes. New ids are viewfv + timestamp + random suffix;
// ids are appended to custom.fvCreatedIds after save.
// =============================================================================

class Plugin extends CollectionPlugin {

    onLoad() {
        this._fvModal = null;
        this._fvKeyHandler = null;
        this._fvEditingId = null;
        this._fvForm = null;
        // Thymer strips non-alphanumeric chars from view ids on save, so the
        // prefix has to survive sanitization (no hyphens, no underscores).
        this._FV_ID_PREFIX = "viewfv";
        this._FV_CUSTOM_KEY = "fvCreatedIds";

        this.injectStyles();

        this.addCollectionNavigationButton({
            label: "Views",
            icon: "ti-filter",
            tooltip: "Manage filtered views for this collection",
            onlyWhenExpanded: false,
            onClick: () => this.openModal(),
        });
    }

    onUnload() {
        if (this._fvModal) this._fvModal.remove();
        if (this._fvKeyHandler) {
            document.removeEventListener("keydown", this._fvKeyHandler);
        }
        this._fvModal = null;
        this._fvKeyHandler = null;
    }

    // -------------------------------------------------------------------------
    // Modal lifecycle
    // -------------------------------------------------------------------------
    closeModal() {
        if (this._fvModal) {
            this._fvModal.remove();
            this._fvModal = null;
        }
        if (this._fvKeyHandler) {
            document.removeEventListener("keydown", this._fvKeyHandler);
            this._fvKeyHandler = null;
        }
        this._fvEditingId = null;
        this._fvForm = null;
    }

    openModal() {
        this.closeModal();

        const overlay = document.createElement("div");
        overlay.className = "tk-fv-overlay";
        overlay.innerHTML = `
            <div class="tk-fv-modal" role="dialog" aria-modal="true">
                <div class="tk-fv-header">
                    <div class="tk-fv-title">
                        <i class="ti ti-template"></i>
                        Filtered Views
                    </div>
                    <button class="tk-fv-close" aria-label="Close">&times;</button>
                </div>
                <div class="tk-fv-body">
                    <div class="tk-fv-section">
                        <div class="tk-fv-section-title">Existing filtered views</div>
                        <div class="tk-fv-list" data-role="manage-list"></div>
                    </div>

                    <div class="tk-fv-divider"></div>

                    <div class="tk-fv-section">
                        <div class="tk-fv-section-header">
                            <div class="tk-fv-section-title" data-role="form-title">Create new view</div>
                            <button type="button" class="tk-fv-cancel-edit" data-role="cancel-edit" hidden>Cancel edit</button>
                        </div>
                        <div class="tk-fv-form">
                            <div class="tk-fv-row">
                                <label for="tk-fv-label">Label</label>
                                <input id="tk-fv-label" type="text" name="label"
                                       placeholder="e.g. My Open Items" autocomplete="off" />
                            </div>

                            <div class="tk-fv-row">
                                <label for="tk-fv-source">Copy from existing view (optional)</label>
                                <select id="tk-fv-source" name="source">
                                    <option value="">&mdash; Start from scratch &mdash;</option>
                                </select>
                                <div class="tk-fv-help">
                                    Pre-fills the form with another view's settings. Edit anything you want to change.
                                </div>
                            </div>

                            <div class="tk-fv-row">
                                <label for="tk-fv-type">View type</label>
                                <select id="tk-fv-type" name="type">
                                    <option value="table">Table</option>
                                    <option value="board">Board</option>
                                    <option value="gallery">Gallery</option>
                                    <option value="calendar">Calendar</option>
                                </select>
                            </div>

                            <div class="tk-fv-row">
                                <label for="tk-fv-query">Filter query</label>
                                <input id="tk-fv-query" type="text" name="query"
                                       placeholder="e.g. @task @today, status:done"
                                       autocomplete="off" />
                                <div class="tk-fv-help">
                                    Same syntax as the search bar. Open the panel below and click items to insert.
                                </div>
                                <details class="tk-fv-cheatsheet-wrap">
                                    <summary class="tk-fv-cheatsheet-toggle">
                                        <i class="ti ti-chevron-right tk-fv-cheatsheet-chevron" aria-hidden="true"></i>
                                        <span>Insert filter elements</span>
                                    </summary>
                                    <div class="tk-fv-cheatsheet" data-role="cheatsheet"></div>
                                </details>
                            </div>

                            <div class="tk-fv-row tk-fv-row-groupby" hidden>
                                <label for="tk-fv-groupby">Group by</label>
                                <select id="tk-fv-groupby" name="groupBy">
                                    <option value="">&mdash; Select a choice field &mdash;</option>
                                </select>
                                <div class="tk-fv-help">
                                    Board views need a choice field to group columns by.
                                </div>
                            </div>

                            <div class="tk-fv-row">
                                <label for="tk-fv-sort">Sort by</label>
                                <select id="tk-fv-sort" name="sortField">
                                    <option value="">&mdash; Default &mdash;</option>
                                </select>
                                <select name="sortDir" class="tk-fv-sort-dir">
                                    <option value="asc">Ascending</option>
                                    <option value="desc">Descending</option>
                                </select>
                            </div>

                            <div class="tk-fv-row">
                                <label>Visible fields</label>
                                <details class="tk-fv-fields-wrap">
                                    <summary class="tk-fv-fields-toggle">
                                        <i class="ti ti-chevron-right tk-fv-fields-chevron" aria-hidden="true"></i>
                                        <span>Select visible fields</span>
                                    </summary>
                                    <div class="tk-fv-fields-toolbar">
                                        <button type="button" class="tk-fv-link-action tk-fv-fields-select-all">all</button>
                                        <span class="tk-fv-fields-toolbar-dot" aria-hidden="true">·</span>
                                        <button type="button" class="tk-fv-link-action tk-fv-fields-select-none">none</button>
                                    </div>
                                    <div class="tk-fv-fields-list" data-role="fields-list"></div>
                                </details>
                                <div class="tk-fv-help">
                                    Open the panel to choose columns. Defaults to all active fields when expanded.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="tk-fv-footer">
                    <button class="tk-fv-btn tk-fv-btn-cancel">Close</button>
                    <button class="tk-fv-btn tk-fv-btn-save">Create View</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this._fvModal = overlay;

        // ----- populate dropdowns from current config ------------------------
        const conf = this.collection.getConfiguration();
        const activeFields = (conf.fields || []).filter((f) => f.active);
        const choiceFields = activeFields.filter((f) => f.type === "choice");

        const groupBySelect = overlay.querySelector("#tk-fv-groupby");
        choiceFields.forEach((f) => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.label;
            groupBySelect.appendChild(opt);
        });

        const sortSelect = overlay.querySelector("#tk-fv-sort");
        activeFields.forEach((f) => {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.label;
            sortSelect.appendChild(opt);
        });

        // Populate "Copy from existing view" with every shown view in this
        // collection -- including built-in ones, since the whole point is
        // borrowing settings from any view the user finds useful.
        const sourceSelect = overlay.querySelector("#tk-fv-source");
        (conf.views || []).forEach((v) => {
            if (v.shown === false) return;
            const opt = document.createElement("option");
            opt.value = v.id;
            opt.textContent = `${v.label} (${v.type})`;
            sourceSelect.appendChild(opt);
        });

        // Populate the visible-fields checkbox group. All checked by default.
        const fieldsListEl = overlay.querySelector('[data-role="fields-list"]');
        activeFields.forEach((f) => {
            const wrapper = document.createElement("label");
            wrapper.className = "tk-fv-field-checkbox";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.name = "visibleField";
            cb.value = f.id;
            cb.checked = true;
            wrapper.appendChild(cb);
            const text = document.createElement("span");
            text.textContent = f.label;
            wrapper.appendChild(text);
            fieldsListEl.appendChild(wrapper);
        });

        const fieldsWrapEl = fieldsListEl.closest(".tk-fv-fields-wrap");
        fieldsWrapEl
            .querySelector(".tk-fv-fields-select-all")
            .addEventListener("click", (e) => {
                e.preventDefault();
                overlay
                    .querySelectorAll('[name="visibleField"]')
                    .forEach((cb) => {
                        cb.checked = true;
                    });
            });
        fieldsWrapEl
            .querySelector(".tk-fv-fields-select-none")
            .addEventListener("click", (e) => {
                e.preventDefault();
                overlay
                    .querySelectorAll('[name="visibleField"]')
                    .forEach((cb) => {
                        cb.checked = false;
                    });
            });

        // Stop ALL key events on form controls from bubbling up to Thymer's
        // global keyboard shortcut handler -- otherwise space, slash, etc. get
        // intercepted before the input ever sees them. Delegated on the
        // overlay so it also covers dynamically added checkboxes.
        const stopKey = (e) => {
            if (e.target.matches("input, select, textarea")) {
                e.stopPropagation();
            }
        };
        overlay.addEventListener("keydown", stopKey);
        overlay.addEventListener("keyup", stopKey);
        overlay.addEventListener("keypress", stopKey);

        // Build the cheat sheet for the query input
        const queryInputEl = overlay.querySelector("#tk-fv-query");
        const cheatsheetEl = overlay.querySelector('[data-role="cheatsheet"]');
        this.buildCheatSheet(cheatsheetEl, queryInputEl, activeFields);

        // ----- wire up controls ----------------------------------------------
        const labelInput = overlay.querySelector("#tk-fv-label");
        const typeSelect = overlay.querySelector("#tk-fv-type");
        const queryInput = overlay.querySelector("#tk-fv-query");
        const groupByRow = overlay.querySelector(".tk-fv-row-groupby");
        const sortDirSelect = overlay.querySelector('[name="sortDir"]');
        const saveBtn = overlay.querySelector(".tk-fv-btn-save");
        const cancelBtn = overlay.querySelector(".tk-fv-btn-cancel");
        const closeBtn = overlay.querySelector(".tk-fv-close");
        const manageList = overlay.querySelector('[data-role="manage-list"]');
        const formTitle = overlay.querySelector('[data-role="form-title"]');
        const cancelEditLink = overlay.querySelector('[data-role="cancel-edit"]');
        const sourceRow = sourceSelect.closest(".tk-fv-row");

        const updateGroupByVisibility = () => {
            groupByRow.hidden = typeSelect.value !== "board";
        };
        typeSelect.addEventListener("change", updateGroupByVisibility);
        updateGroupByVisibility();

        // Stash form refs on the instance so enterEditMode/exitEditMode (which
        // are called from the manage list's pencil button) can reach them.
        this._fvForm = {
            overlay,
            labelInput,
            typeSelect,
            queryInput,
            groupBySelect,
            sortSelect,
            sortDirSelect,
            sourceSelect,
            sourceRow,
            saveBtn,
            formTitle,
            cancelEditLink,
            updateGroupByVisibility,
            fieldsListEl,
        };

        cancelEditLink.addEventListener("click", (e) => {
            e.preventDefault();
            this.exitEditMode();
        });

        this.renderManageList(manageList);

        closeBtn.addEventListener("click", () => this.closeModal());
        cancelBtn.addEventListener("click", () => this.closeModal());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) this.closeModal();
        });
        this._fvKeyHandler = (e) => {
            if (e.key === "Escape") this.closeModal();
        };
        document.addEventListener("keydown", this._fvKeyHandler);

        labelInput.addEventListener("input", () =>
            labelInput.classList.remove("tk-fv-error")
        );
        groupBySelect.addEventListener("change", () =>
            groupBySelect.classList.remove("tk-fv-error")
        );

        // When the user picks a source view, pre-fill the form fields below.
        // The label stays untouched (the user is creating a NEW view, not
        // overwriting the source) and we don't auto-prefix "Copy of" -- forcing
        // a deliberate label keeps the manage list scannable.
        sourceSelect.addEventListener("change", () => {
            const sourceId = sourceSelect.value;
            if (!sourceId) return;
            const source = (conf.views || []).find((v) => v.id === sourceId);
            if (!source) return;

            typeSelect.value = source.type || "table";
            queryInput.value = source.query || "";
            groupBySelect.value = source.group_by_field_id || "";
            sortSelect.value = source.sort_field_id || "";
            sortDirSelect.value = source.sort_dir || "asc";
            updateGroupByVisibility();

            // Pre-check the visible-fields checkboxes to match the source.
            // If the source has no field_ids (some views omit it), check all.
            const sourceFieldIds = Array.isArray(source.field_ids)
                ? new Set(source.field_ids)
                : null;
            overlay
                .querySelectorAll('[name="visibleField"]')
                .forEach((cb) => {
                    cb.checked = sourceFieldIds
                        ? sourceFieldIds.has(cb.value)
                        : true;
                });
        });

        saveBtn.addEventListener("click", async () => {
            const label = labelInput.value.trim();
            if (!label) {
                labelInput.classList.add("tk-fv-error");
                labelInput.focus();
                return;
            }

            const type = typeSelect.value;
            const groupBy = groupBySelect.value || null;
            if (type === "board" && !groupBy) {
                groupBySelect.classList.add("tk-fv-error");
                groupBySelect.focus();
                return;
            }

            const fieldIds = [
                ...overlay.querySelectorAll('[name="visibleField"]:checked'),
            ].map((cb) => cb.value);

            if (fieldIds.length === 0) {
                this.ui.addToaster({
                    title: "Select at least one field",
                    message:
                        'Each view needs at least one visible column. Open "Select visible fields", then use all or check the fields you want.',
                    dismissible: true,
                    autoDestroyTime: 6000,
                });
                const fieldsWrap = overlay.querySelector(".tk-fv-fields-wrap");
                if (fieldsWrap) fieldsWrap.open = true;
                overlay.querySelector('[name="visibleField"]')?.focus();
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = this._fvEditingId ? "Updating..." : "Saving...";

            const formData = {
                label,
                type,
                query: queryInput.value.trim(),
                groupBy,
                sortField: sortSelect.value || null,
                sortDir: sortDirSelect.value,
                fieldIds,
            };

            const ok = this._fvEditingId
                ? await this.updateView(this._fvEditingId, formData)
                : await this.saveNewView(formData);

            saveBtn.disabled = false;
            saveBtn.textContent = this._fvEditingId
                ? "Update View"
                : "Create View";

            if (ok) {
                if (this._fvEditingId) {
                    this.exitEditMode();
                } else {
                    labelInput.value = "";
                    queryInput.value = "";
                    typeSelect.value = "table";
                    groupBySelect.value = "";
                    sortSelect.value = "";
                    sortDirSelect.value = "asc";
                    sourceSelect.value = "";
                    overlay
                        .querySelectorAll('[name="visibleField"]')
                        .forEach((cb) => {
                            cb.checked = true;
                        });
                    updateGroupByVisibility();
                }
                this.renderManageList(manageList);
                labelInput.focus();
            }
        });

        setTimeout(() => labelInput.focus(), 50);
    }

    // -------------------------------------------------------------------------
    // Manage list
    // -------------------------------------------------------------------------
    getCreatedIds(conf) {
        const custom = conf.custom || {};
        const ids = custom[this._FV_CUSTOM_KEY];
        return Array.isArray(ids) ? ids : [];
    }

    renderManageList(container) {
        container.innerHTML = "";

        const conf = this.collection.getConfiguration();
        const createdIds = new Set(this.getCreatedIds(conf));
        const allViews = conf.views || [];

        // Diagnostic: log so we can see what's actually in the config
        console.log("[Filtered Views] renderManageList:", {
            totalViews: allViews.length,
            trackedIds: [...createdIds],
            allViewIds: allViews.map((v) => v.id),
        });

        // Match tracked IDs first; fall back to prefix match for forward-compat
        // with any views that were created before we started tracking in custom.
        const fvViews = allViews.filter(
            (v) =>
                typeof v.id === "string" &&
                (createdIds.has(v.id) || v.id.startsWith(this._FV_ID_PREFIX))
        );

        if (fvViews.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tk-fv-empty";
            empty.textContent = "No filtered views yet. Create one below.";
            container.appendChild(empty);
            return;
        }

        for (const view of fvViews) {
            const row = document.createElement("div");
            row.className = "tk-fv-list-row";
            row.dataset.viewId = view.id;

            const main = document.createElement("div");
            main.className = "tk-fv-list-main";

            const labelEl = document.createElement("div");
            labelEl.className = "tk-fv-list-label";
            labelEl.textContent = view.label || "(unnamed)";

            const metaEl = document.createElement("div");
            metaEl.className = "tk-fv-list-meta";
            const queryText = view.query ? `query: ${view.query}` : "no filter";
            metaEl.textContent = `${view.type} \u2022 ${queryText}`;
            if (view.invalid_query) {
                metaEl.textContent += `  \u26a0 ${view.invalid_query}`;
                metaEl.classList.add("tk-fv-list-meta-error");
            }

            main.appendChild(labelEl);
            main.appendChild(metaEl);

            const actions = document.createElement("div");
            actions.className = "tk-fv-list-actions";

            const editBtn = document.createElement("button");
            editBtn.className = "tk-fv-icon-btn tk-fv-icon-btn-edit";
            editBtn.title = "Edit this view";
            editBtn.innerHTML = '<i class="ti ti-pencil"></i>';
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.enterEditMode(view);
            });
            actions.appendChild(editBtn);

            const delBtn = document.createElement("button");
            delBtn.className = "tk-fv-icon-btn";
            delBtn.title = "Delete this view";
            delBtn.innerHTML = '<i class="ti ti-trash"></i>';
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showInlineConfirm(row, view, container);
            });
            actions.appendChild(delBtn);

            row.appendChild(main);
            row.appendChild(actions);
            container.appendChild(row);
        }
    }

    showInlineConfirm(row, view, container) {
        row.innerHTML = "";
        row.classList.add("tk-fv-list-row-confirm");

        const msg = document.createElement("div");
        msg.className = "tk-fv-list-main";
        msg.innerHTML =
            `<div class="tk-fv-list-label">Delete "${this.escapeText(view.label)}"?</div>` +
            `<div class="tk-fv-list-meta">This cannot be undone.</div>`;

        const actions = document.createElement("div");
        actions.className = "tk-fv-list-actions";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "tk-fv-btn tk-fv-btn-small";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.renderManageList(container);
        });

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "tk-fv-btn tk-fv-btn-small tk-fv-btn-danger";
        confirmBtn.textContent = "Delete";
        confirmBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            confirmBtn.textContent = "Deleting...";
            const ok = await this.deleteView(view.id);
            if (ok) {
                this.renderManageList(container);
            } else {
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                confirmBtn.textContent = "Delete";
            }
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);

        row.appendChild(msg);
        row.appendChild(actions);
    }

    // -------------------------------------------------------------------------
    // Save / delete
    // -------------------------------------------------------------------------
    async saveNewView(formData) {
        const conf = this.collection.getConfiguration();
        const activeFields = (conf.fields || []).filter((f) => f.active);

        if (activeFields.length === 0) {
            this.ui.addToaster({
                title: "Cannot create view",
                message: "This collection has no active fields.",
                dismissible: true,
                autoDestroyTime: 4000,
            });
            return false;
        }

        if (!Array.isArray(formData.fieldIds) || formData.fieldIds.length === 0) {
            this.ui.addToaster({
                title: "Select at least one field",
                message:
                    "A view must include at least one visible column.",
                dismissible: true,
                autoDestroyTime: 5000,
            });
            return false;
        }

        const newView = {
            id: `${this._FV_ID_PREFIX}${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
            label: formData.label,
            description: formData.query
                ? `Filtered: ${formData.query}`
                : "Filtered view",
            type: formData.type,
            icon: "ti-template",
            shown: true,
            read_only: false,
            field_ids: formData.fieldIds,
            sort_field_id: formData.sortField || activeFields[0].id,
            sort_dir: formData.sortDir || "asc",
            group_by_field_id: formData.groupBy,
            query: formData.query,
        };

        if (!Array.isArray(conf.views)) conf.views = [];
        conf.views.push(newView);

        console.log("[Filtered Views] saving new view, requested id:", newView.id);

        let ok;
        try {
            ok = await this.collection.saveConfiguration(conf);
        } catch (err) {
            console.error("[Filtered Views] saveConfiguration threw", err);
            ok = false;
        }

        if (!ok) {
            this.ui.addToaster({
                title: "Could not save view",
                message: "saveConfiguration() failed. Check console for details.",
                dismissible: true,
                autoDestroyTime: 5000,
            });
            return false;
        }

        // Re-read config to find the ID Thymer actually persisted. It may have
        // been sanitized (e.g. hyphens stripped). We identify our view by
        // matching against label + type since those round-trip unchanged, then
        // record whatever id came back so future renders can find it.
        const reloaded = this.collection.getConfiguration();
        const persistedView = (reloaded.views || []).find(
            (v) =>
                v.label === newView.label &&
                v.type === newView.type &&
                !this.getCreatedIds(reloaded).includes(v.id)
        );

        console.log("[Filtered Views] persisted view:", {
            requestedId: newView.id,
            persistedId: persistedView ? persistedView.id : null,
        });

        if (persistedView) {
            // Save again, this time with the real id added to conf.custom
            const conf2 = this.collection.getConfiguration();
            if (!conf2.custom || typeof conf2.custom !== "object")
                conf2.custom = {};
            const existing = this.getCreatedIds(conf2);
            if (!existing.includes(persistedView.id)) {
                conf2.custom[this._FV_CUSTOM_KEY] = [
                    ...existing,
                    persistedView.id,
                ];
                try {
                    await this.collection.saveConfiguration(conf2);
                } catch (err) {
                    console.error(
                        "[Filtered Views] failed to record persisted id",
                        err
                    );
                }
            }
        }

        if (persistedView && persistedView.invalid_query) {
            this.ui.addToaster({
                title: `View "${newView.label}" created -- but the query has an error`,
                message: persistedView.invalid_query,
                dismissible: true,
                autoDestroyTime: 7000,
            });
        } else {
            this.ui.addToaster({
                title: `Created view "${newView.label}"`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // Edit mode
    // -------------------------------------------------------------------------
    enterEditMode(view) {
        if (!this._fvForm) return;
        const f = this._fvForm;

        this._fvEditingId = view.id;

        // Pre-fill all form controls from the view
        f.labelInput.value = view.label || "";
        f.typeSelect.value = view.type || "table";
        f.queryInput.value = view.query || "";
        f.groupBySelect.value = view.group_by_field_id || "";
        f.sortSelect.value = view.sort_field_id || "";
        f.sortDirSelect.value = view.sort_dir || "asc";
        f.updateGroupByVisibility();

        // Pre-check the visible-fields checkboxes to match the view
        const fieldIds = Array.isArray(view.field_ids)
            ? new Set(view.field_ids)
            : null;
        f.overlay
            .querySelectorAll('[name="visibleField"]')
            .forEach((cb) => {
                cb.checked = fieldIds ? fieldIds.has(cb.value) : true;
            });

        // UI affordances: section title, cancel-edit link, save button label,
        // hide the source picker since "copy from" is meaningless during edit.
        f.formTitle.textContent = `Editing: ${view.label || "(unnamed)"}`;
        f.cancelEditLink.hidden = false;
        f.saveBtn.textContent = "Update View";
        f.sourceRow.hidden = true;
        f.sourceSelect.value = "";

        // Visually mark the form as being in edit mode
        f.overlay
            .querySelector(".tk-fv-form")
            .classList.add("tk-fv-form-editing");

        // Scroll the form into view and focus the label input
        try {
            f.labelInput.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (err) {
            // Older browsers without smooth scroll options -- ignore
        }
        setTimeout(() => f.labelInput.focus(), 50);
    }

    exitEditMode() {
        if (!this._fvForm) return;
        const f = this._fvForm;

        this._fvEditingId = null;

        // Reset all form controls to defaults
        f.labelInput.value = "";
        f.typeSelect.value = "table";
        f.queryInput.value = "";
        f.groupBySelect.value = "";
        f.sortSelect.value = "";
        f.sortDirSelect.value = "asc";
        f.sourceSelect.value = "";
        f.overlay
            .querySelectorAll('[name="visibleField"]')
            .forEach((cb) => {
                cb.checked = true;
            });
        f.updateGroupByVisibility();

        // Restore UI to "create new view" state
        f.formTitle.textContent = "Create new view";
        f.cancelEditLink.hidden = true;
        f.saveBtn.textContent = "Create View";
        f.sourceRow.hidden = false;
        f.overlay
            .querySelector(".tk-fv-form")
            .classList.remove("tk-fv-form-editing");
    }

    async updateView(viewId, formData) {
        const conf = this.collection.getConfiguration();
        if (!Array.isArray(conf.views)) return false;

        const idx = conf.views.findIndex((v) => v.id === viewId);
        if (idx === -1) {
            this.ui.addToaster({
                title: "View not found",
                message: "It may have been deleted by someone else.",
                dismissible: true,
                autoDestroyTime: 4000,
            });
            return false;
        }

        const existing = conf.views[idx];
        const activeFields = (conf.fields || []).filter((f) => f.active);

        if (!Array.isArray(formData.fieldIds) || formData.fieldIds.length === 0) {
            this.ui.addToaster({
                title: "Select at least one field",
                message:
                    "A view must include at least one visible column.",
                dismissible: true,
                autoDestroyTime: 5000,
            });
            return false;
        }

        // Build the updated view by merging existing fields with form values.
        // We preserve id, shown, read_only, icon, and any unknown keys the
        // existing view had -- this matters for forward-compat with future
        // CollectionView fields the plugin doesn't know about.
        const updatedView = {
            ...existing,
            label: formData.label,
            description: formData.query
                ? `Filtered: ${formData.query}`
                : "Filtered view",
            type: formData.type,
            field_ids: formData.fieldIds,
            sort_field_id:
                formData.sortField || existing.sort_field_id || activeFields[0].id,
            sort_dir: formData.sortDir || "asc",
            group_by_field_id: formData.groupBy,
            query: formData.query,
        };

        conf.views[idx] = updatedView;

        let ok;
        try {
            ok = await this.collection.saveConfiguration(conf);
        } catch (err) {
            console.error("[Filtered Views] saveConfiguration threw", err);
            ok = false;
        }

        if (!ok) {
            this.ui.addToaster({
                title: "Could not update view",
                message: "saveConfiguration() failed. Check console for details.",
                dismissible: true,
                autoDestroyTime: 5000,
            });
            return false;
        }

        // Re-read to surface any new query syntax errors
        const reloaded = this.collection.getConfiguration();
        const persisted = (reloaded.views || []).find((v) => v.id === viewId);

        if (persisted && persisted.invalid_query) {
            this.ui.addToaster({
                title: `Updated "${updatedView.label}" -- but the query has an error`,
                message: persisted.invalid_query,
                dismissible: true,
                autoDestroyTime: 7000,
            });
        } else {
            this.ui.addToaster({
                title: `Updated view "${updatedView.label}"`,
                dismissible: true,
                autoDestroyTime: 3000,
            });
        }

        return true;
    }

    async deleteView(viewId) {
        const conf = this.collection.getConfiguration();
        if (!Array.isArray(conf.views)) return false;

        const idx = conf.views.findIndex((v) => v.id === viewId);
        if (idx === -1) {
            this.ui.addToaster({
                title: "View not found",
                message: "It may have already been deleted.",
                dismissible: true,
                autoDestroyTime: 4000,
            });
            return false;
        }

        const removed = conf.views[idx];

        // Redirect any panels currently viewing this view BEFORE we splice
        const safeViewId = this.pickSafeAlternativeViewId(conf.views, viewId);
        const panelsToRedirect = this.findPanelsViewingView(viewId);

        for (const panelInfo of panelsToRedirect) {
            try {
                const navOpts = {
                    type: "overview",
                    rootId: panelInfo.collectionGuid,
                    subId: safeViewId || null,
                    workspaceGuid: this.getWorkspaceGuid
                        ? this.getWorkspaceGuid()
                        : null,
                };
                panelInfo.panel.navigateTo(navOpts);
            } catch (err) {
                console.warn("Filtered Views: panel redirect failed", err);
            }
        }

        conf.views.splice(idx, 1);

        // Also remove from our tracked-ids list in conf.custom
        if (conf.custom && Array.isArray(conf.custom[this._FV_CUSTOM_KEY])) {
            conf.custom[this._FV_CUSTOM_KEY] = conf.custom[
                this._FV_CUSTOM_KEY
            ].filter((id) => id !== viewId);
        }

        let ok;
        try {
            ok = await this.collection.saveConfiguration(conf);
        } catch (err) {
            console.error("Filtered Views: saveConfiguration threw", err);
            ok = false;
        }

        if (!ok) {
            this.ui.addToaster({
                title: "Could not delete view",
                message: "saveConfiguration() failed. Check console for details.",
                dismissible: true,
                autoDestroyTime: 5000,
            });
            return false;
        }

        this.ui.addToaster({
            title: `Deleted view "${removed.label}"`,
            dismissible: true,
            autoDestroyTime: 3000,
        });
        return true;
    }

    // -------------------------------------------------------------------------
    // Active-view detection / safe alternative
    // -------------------------------------------------------------------------
    pickSafeAlternativeViewId(views, excludeId) {
        const candidate = views.find(
            (v) => v.id !== excludeId && v.shown !== false
        );
        return candidate ? candidate.id : null;
    }

    findPanelsViewingView(viewId) {
        const result = [];
        const myCollectionGuid = this.collection.getGuid
            ? this.collection.getGuid()
            : null;

        let panels = [];
        try {
            panels = this.ui.getPanels() || [];
        } catch (err) {
            return result;
        }

        for (const panel of panels) {
            let nav;
            try {
                nav = panel.getNavigation();
            } catch (err) {
                continue;
            }
            if (!nav) continue;

            const navCollectionGuid = nav.rootId || null;
            const navViewId = nav.subId || null;
            if (
                navCollectionGuid &&
                myCollectionGuid &&
                navCollectionGuid === myCollectionGuid &&
                navViewId === viewId
            ) {
                result.push({ panel, collectionGuid: navCollectionGuid });
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    escapeText(s) {
        const div = document.createElement("div");
        div.textContent = s == null ? "" : String(s);
        return div.innerHTML;
    }

    // -------------------------------------------------------------------------
    // Query cheat sheet
    // -------------------------------------------------------------------------
    buildCheatSheet(container, queryInput, fields) {
        container.innerHTML = "";

        // ----- Common keywords section --------------------------------------
        // These mirror Thymer's @-keywords. The set is conservative; if your
        // workspace supports more (@waiting, @discuss, etc.), add them here.
        const commonKeywords = [
            { label: "@task", insert: "@task", tip: "Tasks only" },
            { label: "@done", insert: "@done", tip: "Completed tasks" },
            { label: "@today", insert: "@today", tip: "Due today" },
            { label: "@week", insert: "@week", tip: "Due this week" },
            { label: "@overdue", insert: "@overdue", tip: "Past due" },
            { label: "@important", insert: "@important", tip: "Important tasks" },
            { label: "@starred", insert: "@starred", tip: "Starred items" },
        ];

        const commonSection = document.createElement("div");
        commonSection.className = "tk-fv-cs-section";
        const commonLabel = document.createElement("div");
        commonLabel.className = "tk-fv-cs-label";
        commonLabel.textContent = "Common";
        commonSection.appendChild(commonLabel);
        const commonRow = document.createElement("div");
        commonRow.className = "tk-fv-cs-row";
        commonKeywords.forEach((kw) => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = "tk-fv-cs-pill";
            pill.textContent = kw.label;
            pill.title = kw.tip;
            pill.addEventListener("click", (e) => {
                e.preventDefault();
                this.insertAtCursor(queryInput, kw.insert);
            });
            commonRow.appendChild(pill);
        });
        commonSection.appendChild(commonRow);
        container.appendChild(commonSection);

        // ----- Per-field section --------------------------------------------
        if (!fields || fields.length === 0) return;

        const fieldsSection = document.createElement("div");
        fieldsSection.className = "tk-fv-cs-section";
        const fieldsLabel = document.createElement("div");
        fieldsLabel.className = "tk-fv-cs-label";
        fieldsLabel.textContent = "Fields";
        fieldsSection.appendChild(fieldsLabel);

        for (const field of fields) {
            const fieldRow = document.createElement("div");
            fieldRow.className = "tk-fv-cs-field-row";

            // Use the label for the visible button text. Wrap in quotes if it
            // contains a space, since multi-word field names need quoting in
            // most query syntaxes.
            const fieldToken = /\s/.test(field.label)
                ? `"${field.label}"`
                : field.label;

            // The field-name pill inserts `fieldname:` so the user can type a
            // value. For choice fields, the choice pills below insert the full
            // `fieldname:value` pair.
            const fieldPill = document.createElement("button");
            fieldPill.type = "button";
            fieldPill.className = "tk-fv-cs-pill tk-fv-cs-pill-field";
            fieldPill.textContent = `${field.label}:`;
            fieldPill.title = `Insert "${field.label}:" filter`;
            fieldPill.addEventListener("click", (e) => {
                e.preventDefault();
                this.insertAtCursor(queryInput, `${fieldToken}:`);
            });
            fieldRow.appendChild(fieldPill);

            // For choice fields, list the choice values as click-to-insert pills
            if (field.type === "choice" && Array.isArray(field.choices)) {
                const activeChoices = field.choices.filter((c) => c.active);
                for (const choice of activeChoices) {
                    const valueToken = /\s/.test(choice.label)
                        ? `"${choice.label}"`
                        : choice.label;
                    const choicePill = document.createElement("button");
                    choicePill.type = "button";
                    choicePill.className = "tk-fv-cs-pill tk-fv-cs-pill-value";
                    choicePill.textContent = choice.label;
                    choicePill.title = `Insert ${field.label}:${choice.label}`;
                    choicePill.addEventListener("click", (e) => {
                        e.preventDefault();
                        this.insertAtCursor(
                            queryInput,
                            `${fieldToken}:${valueToken}`
                        );
                    });
                    fieldRow.appendChild(choicePill);
                }
            }

            fieldsSection.appendChild(fieldRow);
        }
        container.appendChild(fieldsSection);
    }

    insertAtCursor(input, text) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const before = input.value.slice(0, start);
        const after = input.value.slice(end);

        // Add a leading space if there's existing content not already
        // separated by whitespace.
        let prefix = "";
        if (before.length > 0 && !/\s$/.test(before)) prefix = " ";

        const insertion = prefix + text;
        input.value = before + insertion + after;

        const newPos = start + insertion.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
    }

    // -------------------------------------------------------------------------
    // Styles
    // -------------------------------------------------------------------------
    injectStyles() {
        this.ui.injectCSS(`
            .tk-fv-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.55);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100000;
                font-size: 13px;
                color: #ececec;
            }
            .tk-fv-modal {
                background: #1e1e26;
                border: 1px solid #3a3a48;
                border-radius: 8px;
                width: 520px;
                max-width: calc(100vw - 40px);
                max-height: calc(100vh - 80px);
                display: flex;
                flex-direction: column;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
                overflow: hidden;
            }
            .tk-fv-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                border-bottom: 1px solid #2e2e3a;
            }
            .tk-fv-title {
                font-size: 14px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tk-fv-title i { opacity: 0.8; }
            .tk-fv-close {
                background: transparent;
                border: none;
                color: #aaa;
                font-size: 22px;
                line-height: 1;
                cursor: pointer;
                padding: 0 6px;
                border-radius: 4px;
            }
            .tk-fv-close:hover { background: #2e2e3a; color: #fff; }
            .tk-fv-body {
                padding: 18px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .tk-fv-section-title {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: #8a8a98;
                margin-bottom: 8px;
            }
            .tk-fv-section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            .tk-fv-section-header .tk-fv-section-title {
                margin-bottom: 0;
            }
            .tk-fv-cancel-edit {
                background: transparent;
                border: 1px solid #3a3a48;
                color: #aaa;
                font-size: 11px;
                padding: 3px 10px;
                border-radius: 10px;
                cursor: pointer;
                font-family: inherit;
            }
            .tk-fv-cancel-edit:hover {
                background: #2a2a36;
                color: #fff;
            }
            .tk-fv-form-editing {
                padding: 12px;
                background: #1f1f2e;
                border: 1px solid #3a4670;
                border-radius: 4px;
            }
            .tk-fv-divider {
                height: 1px;
                background: #2e2e3a;
                margin: 0;
            }
            .tk-fv-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .tk-fv-empty {
                padding: 14px;
                color: #777;
                font-style: italic;
                background: #14141a;
                border: 1px dashed #353544;
                border-radius: 4px;
                text-align: center;
            }
            .tk-fv-list-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 10px 12px;
                background: #14141a;
                border: 1px solid #2a2a36;
                border-radius: 4px;
            }
            .tk-fv-list-row-confirm {
                border-color: #d04848;
                background: #2a1515;
            }
            .tk-fv-list-main { flex: 1; min-width: 0; }
            .tk-fv-list-label {
                font-weight: 600;
                color: #ececec;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .tk-fv-list-meta {
                font-size: 11px;
                color: #888898;
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .tk-fv-list-meta-error { color: #e08080; }
            .tk-fv-list-actions {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-shrink: 0;
            }
            .tk-fv-icon-btn {
                background: transparent;
                border: 1px solid transparent;
                color: #aaa;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
            }
            .tk-fv-icon-btn:hover {
                background: #2a1515;
                border-color: #d04848;
                color: #f08080;
            }
            .tk-fv-icon-btn-edit:hover {
                background: #1f2540;
                border-color: #5c6cf2;
                color: #b8c4f0;
            }
            .tk-fv-form { display: flex; flex-direction: column; gap: 14px; }
            .tk-fv-row { display: flex; flex-direction: column; gap: 6px; }
            .tk-fv-row label {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #9a9aa8;
            }
            .tk-fv-row input[type="text"],
            .tk-fv-row select {
                background: #14141a;
                border: 1px solid #353544;
                border-radius: 4px;
                padding: 8px 10px;
                color: #ececec;
                font-size: 13px;
                font-family: inherit;
                outline: none;
            }
            .tk-fv-row input[type="text"]:focus,
            .tk-fv-row select:focus { border-color: #5c6cf2; }
            .tk-fv-row .tk-fv-error { border-color: #d04848; }
            .tk-fv-help {
                font-size: 11px;
                color: #777787;
                margin-top: 2px;
            }
            .tk-fv-cheatsheet-wrap {
                margin-top: 8px;
                border: 1px solid #2a2a36;
                border-radius: 4px;
                background: #14141a;
                overflow: hidden;
            }
            .tk-fv-cheatsheet-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #9a9aa8;
                user-select: none;
                list-style: none;
            }
            .tk-fv-cheatsheet-toggle::-webkit-details-marker { display: none; }
            .tk-fv-cheatsheet-toggle:hover { background: #1a1a22; }
            .tk-fv-cheatsheet-wrap[open] > .tk-fv-cheatsheet-toggle {
                border-bottom: 1px solid #2a2a36;
            }
            .tk-fv-cheatsheet-chevron {
                font-size: 14px;
                opacity: 0.75;
                transition: transform 0.15s ease;
            }
            .tk-fv-cheatsheet-wrap[open] > .tk-fv-cheatsheet-toggle .tk-fv-cheatsheet-chevron {
                transform: rotate(90deg);
            }
            .tk-fv-cheatsheet {
                margin-top: 0;
                padding: 10px;
                background: transparent;
                border: none;
                border-radius: 0;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-height: 220px;
                overflow-y: auto;
            }
            .tk-fv-cs-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .tk-fv-cs-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #6a6a78;
            }
            .tk-fv-cs-row {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
            }
            .tk-fv-cs-field-row {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: center;
                padding: 4px 0;
                border-top: 1px dashed #242430;
            }
            .tk-fv-cs-field-row:first-of-type { border-top: none; }
            .tk-fv-cs-pill {
                background: #2a2a36;
                border: 1px solid #3a3a48;
                color: #cfcfd8;
                padding: 3px 8px;
                border-radius: 10px;
                cursor: pointer;
                font-size: 11px;
                font-family: inherit;
                line-height: 1.4;
            }
            .tk-fv-cs-pill:hover {
                background: #353548;
                border-color: #5c6cf2;
                color: #fff;
            }
            .tk-fv-cs-pill-field {
                background: #1f2540;
                border-color: #3a4670;
                color: #b8c4f0;
                font-weight: 600;
            }
            .tk-fv-cs-pill-field:hover {
                background: #2a3258;
            }
            .tk-fv-cs-pill-value {
                background: #1f2a1f;
                border-color: #3a5a3a;
                color: #b8d4b8;
            }
            .tk-fv-cs-pill-value:hover {
                background: #2a3a2a;
            }
            .tk-fv-sort-dir { margin-top: 6px; }
            .tk-fv-fields-wrap {
                border: 1px solid #2a2a36;
                border-radius: 4px;
                background: #14141a;
                overflow: hidden;
            }
            .tk-fv-fields-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #9a9aa8;
                user-select: none;
                list-style: none;
            }
            .tk-fv-fields-toggle::-webkit-details-marker { display: none; }
            .tk-fv-fields-toggle:hover { background: #1a1a22; }
            .tk-fv-fields-wrap[open] > .tk-fv-fields-toggle {
                border-bottom: 1px solid #2a2a36;
            }
            .tk-fv-fields-chevron {
                font-size: 14px;
                opacity: 0.75;
                transition: transform 0.15s ease;
            }
            .tk-fv-fields-wrap[open] > .tk-fv-fields-toggle .tk-fv-fields-chevron {
                transform: rotate(90deg);
            }
            .tk-fv-fields-toolbar {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
                padding: 6px 10px 0 10px;
                font-size: 11px;
            }
            .tk-fv-fields-toolbar-dot {
                opacity: 0.45;
                user-select: none;
            }
            .tk-fv-link-action {
                background: none;
                border: none;
                padding: 0;
                margin: 0;
                cursor: pointer;
                font-size: 11px;
                font-family: inherit;
                color: #7a7a8c;
                text-decoration: underline;
                text-underline-offset: 2px;
            }
            .tk-fv-link-action:hover {
                color: #5c6cf2;
            }
            .tk-fv-fields-list {
                display: flex;
                flex-wrap: wrap;
                gap: 6px 14px;
                padding: 10px;
                background: transparent;
                border: none;
                border-radius: 0;
                max-height: 140px;
                overflow-y: auto;
            }
            .tk-fv-field-checkbox {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 12px;
                color: #cfcfd8;
                user-select: none;
            }
            .tk-fv-field-checkbox input[type="checkbox"] {
                margin: 0;
                cursor: pointer;
            }
            .tk-fv-field-checkbox:hover { color: #fff; }
            .tk-fv-footer {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                padding: 12px 18px;
                border-top: 1px solid #2e2e3a;
                background: #191921;
            }
            .tk-fv-btn {
                background: #2a2a36;
                border: 1px solid #3f3f4f;
                color: #ececec;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-family: inherit;
            }
            .tk-fv-btn:hover { background: #353548; }
            .tk-fv-btn-small { padding: 5px 10px; font-size: 12px; }
            .tk-fv-btn-save {
                background: #4a5cf0;
                border-color: #5c6cf2;
            }
            .tk-fv-btn-save:hover { background: #5566f5; }
            .tk-fv-btn-save:disabled,
            .tk-fv-btn:disabled {
                background: #2a2a36;
                border-color: #3f3f4f;
                color: #777;
                cursor: not-allowed;
            }
            .tk-fv-btn-danger {
                background: #d04848;
                border-color: #e05858;
                color: #fff;
            }
            .tk-fv-btn-danger:hover { background: #e05858; }
        `);
    }
}
