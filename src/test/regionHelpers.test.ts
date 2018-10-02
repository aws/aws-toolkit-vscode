/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { DefaultRegionProvider } from '../shared/regions/defaultRegionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { ResourceLocation } from '../shared/resourceLocation'

suite('ResourceFetcherBase Tests', function(): void {

    class ResourceFetcherCounter implements ResourceFetcher {
        public timesCalled = 0

        public async getResource(resourceLocations: ResourceLocation[]): Promise<string> {
            this.timesCalled++

            return JSON.stringify({
                partitions: []
            })
        }
    }

    class FakeMemento implements vscode.Memento {
        public get<T>(key: string): T | undefined
        public  get<T>(key: string, defaultValue: T): T
        public get(key: any, defaultValue?: any) {
            throw new Error('Method not implemented.')
        }
        public update(key: string, value: any): Thenable<void> {
            throw new Error('Method not implemented.')
        }
    }

    class FakeExtensionContext implements vscode.ExtensionContext {
        public subscriptions: {
            dispose(): any;
        }[] = []
        public workspaceState: vscode.Memento = new FakeMemento()
        public globalState: vscode.Memento = new FakeMemento()
        public extensionPath: string = ''
        public storagePath: string | undefined

        public asAbsolutePath(relativePath: string): string {
            throw new Error('Method not implemented.')
        }
    }

    test('Fetches something', async function() {
        const fetchCounter = new ResourceFetcherCounter()
        const context = new FakeExtensionContext()
        const regionProvider = new DefaultRegionProvider(context, fetchCounter)

        await regionProvider.getRegionData()

        assert.equal(fetchCounter.timesCalled, 1)
    })

    test('Fetches something the first time only', async function() {
        const fetchCounter = new ResourceFetcherCounter()
        const context = new FakeExtensionContext()
        const regionProvider = new DefaultRegionProvider(context, fetchCounter)

        await regionProvider.getRegionData()
        await regionProvider.getRegionData()

        assert.equal(fetchCounter.timesCalled, 1)
    })

})
