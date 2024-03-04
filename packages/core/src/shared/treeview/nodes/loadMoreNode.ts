/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a Node that has the ability to load more results.
 *
 * VSCode currently only provides a single entry point to refresh a Node.
 * You fire the onDidChangeTreeData event emitter on the Node you want to refresh.
 *
 * As a result, this:
 * 1) calls getChildren() on the Node
 * AND THEN
 * 2) calls getChildren() any of its expanded children Nodes recursively
 *
 * Because all attempts to "update" a Node are surfaced as calls to getChildren(),
 * it's difficult to distinguish the intent of the calls.
 * An update can mean "load your initial children", "load more children", or just "return your loaded children".
 * This is further complicated by (2) above, where a "load more children" request on the parent Node
 * results in further "return your loaded children" requests on the children.
 *
 * To differentiate these cases, a refresh with the intent to "load more children" must be prefaced by a call
 * to loadMoreChildren().
 *
 * loadMoreChildren() instructs the Node to append the next "page" of results to its cache.
 * After that, the Node must be refreshed to trigger a call to getChildren() (i.e. "return your loaded children").
 * That will correctly display the (existing and) new results that were appended to the cache.
 */
export interface LoadMoreNode {
    /**
     * Instructs the Node to append the next "page" of results to its cache.
     *
     * After that, the Node must be refreshed to trigger a call to getChildren() (i.e. "return your loaded children").
     * That will correctly display the (existing and) new results that were appended to the cache.
     */
    loadMoreChildren(): Promise<void>

    /**
     * Returns true if a {@link loadMoreChildren} call is in progress.
     */
    isLoadingMoreChildren(): boolean

    /**
     * Clears all children from the Node's cache.
     */
    clearChildren(): void
}
