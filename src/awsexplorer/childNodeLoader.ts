/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../shared/treeview/nodes/loadMoreNode'
import { MoreResultsNode } from './moreResultsNode'
import { ChildNodeCache } from './childNodeCache'

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
    private cache: ChildNodeCache

    public constructor(
        parent: LoadMoreNode,
        loadPage: (continuationToken: string | undefined) => Promise<ChildNodePage>
    ) {
        this.loadPage = loadPage
        this.moreResults = new MoreResultsNode(parent)
        this.cache = new ChildNodeCache()
    }

    /**
     * Gets the initial or previously-loaded children.
     */
    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.initialChildrenLoaded()) {
            return this.loadInitialChildren()
        }

        return this.getExistingChildren()
    }

    /**
     * Loads and returns more children.
     */
    public async loadMoreChildren(): Promise<AWSTreeNodeBase[]> {
        const newPage = await this.loadPage(this.cache.continuationToken)

        this.cache.appendPage(newPage)
        return this.getExistingChildren()
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

    private async loadInitialChildren(): Promise<AWSTreeNodeBase[]> {
        return this.loadMoreChildren()
    }

    private async getExistingChildren(): Promise<AWSTreeNodeBase[]> {
        if (this.cache.continuationToken !== undefined) {
            return [...this.cache.children, this.moreResults]
        }

        return this.cache.children
    }
}
