/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { ChildNodePage } from './childNodeLoader'

/**
 * The state for a Node with paginated children.
 *
 * Allows for easier appending to the node's children and less error-prone (resetting) of the node's internal state.
 */
export class ChildNodeCache<T extends AWSTreeNodeBase = AWSTreeNodeBase> {
    private _children: T[] = []
    private _continuationToken: string | undefined = undefined
    private _isPristine: boolean = true

    /**
     * Appends a new page to the cache.
     *
     * Once this has been called, the cache is no longer considered pristine ({@link isPristine} will return false).
     * This is true even if the original state of the cache remains unchanged (all items appended are empty/undefined).
     */
    public appendPage(page: ChildNodePage<T>): void {
        this._children = [...this._children, ...page.newChildren]
        this._continuationToken = page.newContinuationToken
        this._isPristine = false
    }

    /**
     * The list of children nodes previously appended to the cache.
     */
    public get children(): T[] {
        return this._children
    }

    /**
     * The continuation token that was last written to the cache.
     */
    public get continuationToken(): string | undefined {
        return this._continuationToken
    }

    /**
     * Returns true if the cache is completely new and untouched (apart from construction).
     *
     * Once {@link appendPage} has been called, the cache is no longer considered pristine.
     * This is true even if the original state of the cache remains unchanged (all items appended are empty/undefined).
     */
    public get isPristine(): boolean {
        return this._isPristine
    }
}
