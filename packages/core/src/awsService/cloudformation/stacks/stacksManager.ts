/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands, Disposable } from 'vscode'
import { StackStatus, StackSummary } from '@aws-sdk/client-cloudformation'
import { RequestType } from 'vscode-languageserver-protocol'
import { LanguageClient } from 'vscode-languageclient/node'
import { handleLspError } from '../utils/onlineErrorHandler'
import { commandKey } from '../utils'
import { setContext } from '../../../shared/vscode/setContext'

type ListStacksParams = {
    statusToInclude?: StackStatus[]
    statusToExclude?: StackStatus[]
    loadMore?: boolean
}

type ListStacksResult = {
    stacks: StackSummary[]
    nextToken?: string
}

const ListStacksRequest = new RequestType<ListStacksParams, ListStacksResult, void>('aws/cfn/stacks')

type StacksChangeListener = (stacks: StackSummary[]) => void

export class StacksManager implements Disposable {
    private stacks: StackSummary[] = []
    private nextToken?: string
    private readonly listeners: StacksChangeListener[] = []
    private loaded = false

    constructor(private readonly client: LanguageClient) {}

    addListener(listener: StacksChangeListener) {
        this.listeners.push(listener)
    }

    get() {
        return [...this.stacks]
    }

    hasMore(): boolean {
        return this.nextToken !== undefined
    }

    reload() {
        void this.loadStacks()
    }

    isLoaded() {
        return this.loaded
    }

    async ensureLoaded() {
        if (!this.loaded) {
            await this.loadStacks()
        }
    }

    clear() {
        this.stacks = []
        this.nextToken = undefined
        this.loaded = false
        this.notifyListeners()
    }

    updateStackStatus(stackName: string, stackStatus: string) {
        const stack = this.stacks.find((s) => s.StackName === stackName)
        if (stack) {
            stack.StackStatus = stackStatus as any
            this.notifyListeners()
        }
    }

    async loadMoreStacks() {
        if (!this.nextToken) {
            return
        }

        await setContext('aws.cloudformation.loadingStacks', true)
        try {
            const response = await this.client.sendRequest(ListStacksRequest, {
                statusToExclude: ['DELETE_COMPLETE'],
                loadMore: true,
            })
            this.stacks = response.stacks
            this.nextToken = response.nextToken
        } catch (error) {
            await handleLspError(error, 'Error loading more stacks')
        } finally {
            await setContext('aws.cloudformation.loadingStacks', false)
            this.notifyListeners()
        }
    }

    dispose() {
        // do nothing
    }

    private async loadStacks() {
        await setContext('aws.cloudformation.refreshingStacks', true)
        try {
            const response = await this.client.sendRequest(ListStacksRequest, {
                statusToExclude: ['DELETE_COMPLETE'],
                loadMore: false,
            })
            this.stacks = response.stacks
            this.nextToken = response.nextToken
            this.loaded = true
        } catch (error) {
            await handleLspError(error, 'Error loading stacks')
            this.stacks = []
            this.nextToken = undefined
        } finally {
            await setContext('aws.cloudformation.refreshingStacks', false)
            this.notifyListeners()
        }
    }

    private notifyListeners() {
        for (const listener of this.listeners) {
            listener(this.stacks)
        }
    }
}

export function refreshCommand(manager: StacksManager) {
    return commands.registerCommand(commandKey('stacks.refresh'), () => {
        manager.reload()
    })
}
