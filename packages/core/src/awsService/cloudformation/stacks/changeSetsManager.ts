/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient/node'
import { ListChangeSetsRequest } from './actions/stackActionProtocol'
import { ChangeSetInfo } from './actions/stackActionRequestType'

type StackChangeSets = {
    changeSets: ChangeSetInfo[]
    nextToken?: string
}

export class ChangeSetsManager {
    private stackChangeSets = new Map<string, StackChangeSets>()

    constructor(private readonly client: LanguageClient) {}

    async getChangeSets(stackName: string): Promise<ChangeSetInfo[]> {
        try {
            const response = await this.client.sendRequest(ListChangeSetsRequest, {
                stackName,
            })

            this.stackChangeSets.set(stackName, {
                changeSets: response.changeSets,
                nextToken: response.nextToken,
            })

            return response.changeSets
        } catch (error) {
            this.stackChangeSets.set(stackName, { changeSets: [] })
            return []
        }
    }

    async loadMoreChangeSets(stackName: string): Promise<void> {
        const current = this.stackChangeSets.get(stackName)
        if (!current?.nextToken) {
            return
        }

        try {
            const response = await this.client.sendRequest(ListChangeSetsRequest, {
                stackName,
                nextToken: current.nextToken,
            })

            this.stackChangeSets.set(stackName, {
                changeSets: [...current.changeSets, ...response.changeSets],
                nextToken: response.nextToken,
            })
        } catch (error) {
            // Keep existing data on error
        }
    }

    get(stackName: string): ChangeSetInfo[] {
        return this.stackChangeSets.get(stackName)?.changeSets ?? []
    }

    hasMore(stackName: string): boolean {
        return this.stackChangeSets.get(stackName)?.nextToken !== undefined
    }
}
