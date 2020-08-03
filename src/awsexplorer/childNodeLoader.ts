/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../shared/treeview/nodes/loadMoreNode'
import { MoreResultsNode } from './moreResultsNode'
import { ChildNodeCache } from './childNodeCache'
import * as AsyncLock from 'async-lock'

const LOCK_KEY = 'ChildNodeLoader'

export interface ChildNodePage {
    newChildren: AWSTreeNodeBase[]
    newContinuationToken: string | undefined
}

/**
 * Controls loading paginated children for LoadMore nodes.
 */
export class ChildNodeLoader {
    private readonly loadPage: (continuationToken: string | undefined) => Promise<ChildNodePage>
    private readonly moreResults: MoreResultsNode
    private readonly loadChildrenLock: AsyncLock
    private cache: ChildNodeCache

    public constructor(
        parent: LoadMoreNode,
        loadPage: (continuationToken: string | undefined) => Promise<ChildNodePage>
    ) {
        this.loadPage = loadPage
        this.moreResults = new MoreResultsNode(parent)
        this.loadChildrenLock = new AsyncLock()
        this.cache = new ChildNodeCache()
    }

    /**
     * Gets the initial or previously-loaded children.
     */
    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        await this.loadMoreChildrenIf(() => !this.initialChildrenLoaded())
        return this.getExistingChildren()
    }

    /**
     * Loads and appends a new page of children.
     *
     * If there is no new page of children, has no effect.
     */
    public async loadMoreChildren(): Promise<void> {
        return this.loadMoreChildrenIf(() => !this.allChildrenLoaded())
    }

    /**
     * Returns true if a {@link loadMoreChildren} call is in progress.
     */
    public isLoadingMoreChildren(): boolean {
        return this.loadChildrenLock.isBusy(LOCK_KEY)
    }

    /**
     * Clears all previously-loaded children.
     */
    public clearChildren(): void {
        this.cache = new ChildNodeCache()
    }

    private initialChildrenLoaded(): boolean {
        return !this.cache.isPristine
    }

    private allChildrenLoaded(): boolean {
        return this.initialChildrenLoaded() && this.cache.continuationToken === undefined
    }

    private getExistingChildren(): AWSTreeNodeBase[] {
        if (this.cache.continuationToken !== undefined) {
            return [...this.cache.children, this.moreResults]
        }

        return this.cache.children
    }

    /**
     * Prevents multiple concurrent attempts to load next page.
     *
     * This can happen if the user double clicks a node that executes a command before the node is hidden.
     * In this case, the attempts are queued up.
     *
     * @param condition a double checked condition that must evaluate to true for the page load to take place.
     */
    private async loadMoreChildrenIf(condition: () => boolean): Promise<void> {
        if (condition()) {
            return this.loadChildrenLock.acquire(LOCK_KEY, async () => {
                if (condition()) {
                    const newPage = await this.loadPage(this.cache.continuationToken)
                    this.cache.appendPage(newPage)
                }
            })
        }
    }
}
