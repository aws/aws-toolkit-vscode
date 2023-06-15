/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

declare module 'vscode' {
    namespace window {
        export const tabGroups: TabGroups

        /**
         * The tab represents a single text based resource.
         */
        export class TabInputText {
            /**
             * The uri represented by the tab.
             */
            readonly uri: Uri
            /**
             * Constructs a text tab input with the given URI.
             * @param uri The URI of the tab.
             */
            constructor(uri: Uri)
        }

        /**
         * The tab represents two text based resources
         * being rendered as a diff.
         */
        export class TabInputTextDiff {
            /**
             * The uri of the original text resource.
             */
            readonly original: Uri
            /**
             * The uri of the modified text resource.
             */
            readonly modified: Uri
            /**
             * Constructs a new text diff tab input with the given URIs.
             * @param original The uri of the original text resource.
             * @param modified The uri of the modified text resource.
             */
            constructor(original: Uri, modified: Uri)
        }

        /**
         * The tab represents a custom editor.
         */
        export class TabInputCustom {
            /**
             * The uri that the tab is representing.
             */
            readonly uri: Uri
            /**
             * The type of custom editor.
             */
            readonly viewType: string
            /**
             * Constructs a custom editor tab input.
             * @param uri The uri of the tab.
             * @param viewType The viewtype of the custom editor.
             */
            constructor(uri: Uri, viewType: string)
        }

        /**
         * The tab represents a webview.
         */
        export class TabInputWebview {
            /**
             * The type of webview. Maps to {@linkcode WebviewPanel.viewType WebviewPanel's viewType}
             */
            readonly viewType: string
            /**
             * Constructs a webview tab input with the given view type.
             * @param viewType The type of webview. Maps to {@linkcode WebviewPanel.viewType WebviewPanel's viewType}
             */
            constructor(viewType: string)
        }

        /**
         * The tab represents a notebook.
         */
        export class TabInputNotebook {
            /**
             * The uri that the tab is representing.
             */
            readonly uri: Uri
            /**
             * The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
             */
            readonly notebookType: string
            /**
             * Constructs a new tab input for a notebook.
             * @param uri The uri of the notebook.
             * @param notebookType The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
             */
            constructor(uri: Uri, notebookType: string)
        }

        /**
         * The tabs represents two notebooks in a diff configuration.
         */
        export class TabInputNotebookDiff {
            /**
             * The uri of the original notebook.
             */
            readonly original: Uri
            /**
             * The uri of the modified notebook.
             */
            readonly modified: Uri
            /**
             * The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
             */
            readonly notebookType: string
            /**
             * Constructs a notebook diff tab input.
             * @param original The uri of the original unmodified notebook.
             * @param modified The uri of the modified notebook.
             * @param notebookType The type of notebook. Maps to {@linkcode NotebookDocument.notebookType NotebookDocuments's notebookType}
             */
            constructor(original: Uri, modified: Uri, notebookType: string)
        }

        /**
         * The tab represents a terminal in the editor area.
         */
        export class TabInputTerminal {
            /**
             * Constructs a terminal tab input.
             */
            constructor()
        }

        /**
         * Represents a tab within a {@link TabGroup group of tabs}.
         * Tabs are merely the graphical representation within the editor area.
         * A backing editor is not a guarantee.
         */
        export interface Tab {
            /**
             * The text displayed on the tab.
             */
            readonly label: string

            /**
             * The group which the tab belongs to.
             */
            readonly group: TabGroup

            /**
             * Defines the structure of the tab i.e. text, notebook, custom, etc.
             * Resource and other useful properties are defined on the tab kind.
             */
            readonly input:
                | TabInputText
                | TabInputTextDiff
                | TabInputCustom
                | TabInputWebview
                | TabInputNotebook
                | TabInputNotebookDiff
                | TabInputTerminal
                | unknown

            /**
             * Whether or not the tab is currently active.
             * This is dictated by being the selected tab in the group.
             */
            readonly isActive: boolean

            /**
             * Whether or not the dirty indicator is present on the tab.
             */
            readonly isDirty: boolean

            /**
             * Whether or not the tab is pinned (pin icon is present).
             */
            readonly isPinned: boolean

            /**
             * Whether or not the tab is in preview mode.
             */
            readonly isPreview: boolean
        }

        /**
         * An event describing change to tabs.
         */
        export interface TabChangeEvent {
            /**
             * The tabs that have been opened.
             */
            readonly opened: readonly Tab[]
            /**
             * The tabs that have been closed.
             */
            readonly closed: readonly Tab[]
            /**
             * Tabs that have changed, e.g have changed
             * their {@link Tab.isActive active} state.
             */
            readonly changed: readonly Tab[]
        }

        /**
         * An event describing changes to tab groups.
         */
        export interface TabGroupChangeEvent {
            /**
             * Tab groups that have been opened.
             */
            readonly opened: readonly TabGroup[]
            /**
             * Tab groups that have been closed.
             */
            readonly closed: readonly TabGroup[]
            /**
             * Tab groups that have changed, e.g have changed
             * their {@link TabGroup.isActive active} state.
             */
            readonly changed: readonly TabGroup[]
        }

        /**
         * Represents a group of tabs. A tab group itself consists of multiple tabs.
         */
        export interface TabGroup {
            /**
             * Whether or not the group is currently active.
             *
             * *Note* that only one tab group is active at a time, but that multiple tab
             * groups can have an {@link activeTab active tab}.
             *
             * @see {@link Tab.isActive}
             */
            readonly isActive: boolean

            /**
             * The view column of the group.
             */
            readonly viewColumn: ViewColumn

            /**
             * The active {@link Tab tab} in the group. This is the tab whose contents are currently
             * being rendered.
             *
             * *Note* that there can be one active tab per group but there can only be one {@link TabGroups.activeTabGroup active group}.
             */
            readonly activeTab: Tab | undefined

            /**
             * The list of tabs contained within the group.
             * This can be empty if the group has no tabs open.
             */
            readonly tabs: readonly Tab[]
        }

        /**
         * Represents the main editor area which consists of multiple groups which contain tabs.
         */
        export interface TabGroups {
            /**
             * All the groups within the group container.
             */
            readonly all: readonly TabGroup[]

            /**
             * The currently active group.
             */
            readonly activeTabGroup: TabGroup

            /**
             * An {@link Event event} which fires when {@link TabGroup tab groups} have changed.
             */
            readonly onDidChangeTabGroups: Event<TabGroupChangeEvent>

            /**
             * An {@link Event event} which fires when {@link Tab tabs} have changed.
             */
            readonly onDidChangeTabs: Event<TabChangeEvent>

            /**
             * Closes the tab. This makes the tab object invalid and the tab
             * should no longer be used for further actions.
             * Note: In the case of a dirty tab, a confirmation dialog will be shown which may be cancelled. If cancelled the tab is still valid
             *
             * @param tab The tab to close.
             * @param preserveFocus When `true` focus will remain in its current position. If `false` it will jump to the next tab.
             * @returns A promise that resolves to `true` when all tabs have been closed.
             */
            close(tab: Tab | readonly Tab[], preserveFocus?: boolean): Thenable<boolean>

            /**
             * Closes the tab group. This makes the tab group object invalid and the tab group
             * should no longer be used for further actions.
             * @param tabGroup The tab group to close.
             * @param preserveFocus When `true` focus will remain in its current position.
             * @returns A promise that resolves to `true` when all tab groups have been closed.
             */
            close(tabGroup: TabGroup | readonly TabGroup[], preserveFocus?: boolean): Thenable<boolean>
        }
    }
}
