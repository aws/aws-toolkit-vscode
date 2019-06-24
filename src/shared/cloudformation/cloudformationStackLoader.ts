/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { CloudFormationClient } from '../clients/cloudFormationClient'
import { ext } from '../extensionGlobals'
import { BaseItemsLoader } from '../utilities/itemsLoader'
import { ToolkitCancellationToken } from '../utilities/toolkitCancellationToken'

/**
 * Loads info about CloudFormation Stacks, and emits the stacks as events as they are loaded in.
 */
export class CloudFormationStackLoader extends BaseItemsLoader<CloudFormation.StackSummary> {
    public readonly cancellationToken: ToolkitCancellationToken = new ToolkitCancellationToken()

    private loadStarted: boolean = false

    public constructor(
        protected readonly region: string
    ) {
        super()
    }

    public async load(): Promise<void> {
        this.verifyLoadNotStarted()
        this.loadStarted = true
        this.loadStartEmitter.fire()

        const stacksIter = this.loadCloudFormationStacks()

        for await (const stack of stacksIter) {
            if (this.cancellationToken.isCancellationRequested) {
                // todo : CC : fire with cancelled information
                break
            }

            this.itemEmitter.fire(stack)
        }

        this.loadEndEmitter.fire()
        // todo : CC : failure handling
    }

    public get onItem(): vscode.Event<CloudFormation.StackSummary> {
        this.verifyLoadNotStarted()

        return super.onItem
    }

    public get onLoadStart(): vscode.Event<void> {
        this.verifyLoadNotStarted()

        return super.onLoadStart
    }

    public get onLoadEnd(): vscode.Event<void> {
        this.verifyLoadNotStarted()

        return super.onLoadEnd
    }

    protected makeCloudFormationClient(): CloudFormationClient {
        return ext.toolkitClientBuilder.createCloudFormationClient(this.region)
    }

    private async* loadCloudFormationStacks(
        statusFilter: string[] = ['CREATE_COMPLETE', 'UPDATE_COMPLETE']
    ): AsyncIterableIterator<CloudFormation.StackSummary> {
        const cloudFormationClient = this.makeCloudFormationClient()

        yield* cloudFormationClient.listStacks()
    }

    private verifyLoadNotStarted() {
        if (this.loadStarted) {
            throw new Error('Loading has already started.')
        }
    }
}
