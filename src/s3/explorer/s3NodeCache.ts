/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3FolderNode } from './s3FolderNode'
import { S3FileNode } from './s3FileNode'
import { S3MoreResultsNode } from './s3MoreResultsNode'

/**
 * The state for an S3 Node with paginated children.
 *
 * Allows for easier appending to the node's children and less error-prone (resetting) of the node's internal state.
 */
export class S3NodeCache {
    private _foldersAndFiles: (S3FolderNode | S3FileNode)[]
    private readonly _moreResults: S3MoreResultsNode
    private _continuationToken: string | undefined
    private _isPristine: boolean

    /**
     * Creates an S3NodeCache.
     *
     * @param moreResults an additional node returned at the end of {@link nodes} to signal the loading of more pages.
     * If there are no more pages, this node will be suppressed from the output.
     */
    public constructor(moreResults: S3MoreResultsNode) {
        this._moreResults = moreResults
        this._foldersAndFiles = []
        this._continuationToken = undefined
        this._isPristine = true
    }

    /**
     * Appends new folders and files to the cache and updates the continuation token.
     *
     * Once this has been called, the cache is no longer considered pristine ({@link isPristine} will return false).
     * This is true even if the original state of the cache remains unchanged (all items appended are empty/undefined).
     */
    public appendItems(
        newFolders: S3FolderNode[],
        newFiles: S3FileNode[],
        continuationToken: string | undefined
    ): void {
        this._foldersAndFiles = [...this._foldersAndFiles, ...newFolders, ...newFiles]
        this._continuationToken = continuationToken
        this._isPristine = false
    }

    /**
     * The list of nodes previously appended to the cache.
     *
     * Returns the MoreResults node at the end of the list if more pages exist for the node.
     */
    public get nodes(): (S3FolderNode | S3FileNode | S3MoreResultsNode)[] {
        if (this._continuationToken) {
            return [...this._foldersAndFiles, this._moreResults]
        } else {
            return this._foldersAndFiles
        }
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
     * Once {@link appendItems} has been called, the cache is no longer considered pristine.
     * This is true even if the original state of the cache remains unchanged (all items appended are empty/undefined).
     */
    public get isPristine(): boolean {
        return this._isPristine
    }
}
