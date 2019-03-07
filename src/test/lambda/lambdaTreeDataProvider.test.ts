/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as AWS from 'aws-sdk'
import * as vscode from 'vscode'
import { RegionNode } from '../../lambda/explorer/regionNode'
import { LambdaTreeDataProvider } from '../../lambda/lambdaTreeDataProvider'
import { AwsContext, ContextChangeEventsArgs } from '../../shared/awsContext'
import { AwsContextTreeCollection } from '../../shared/awsContextTreeCollection'
import { RegionInfo } from '../../shared/regions/regionInfo'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { ResourceFetcher } from '../../shared/resourceFetcher'
import { ResourceLocation } from '../../shared/resourceLocation'
import { MockOutputChannel } from '../mockOutputChannel'

describe('LambdaProvider', () => {

    it('displays region nodes with user-friendly region names', async () => {

        const regionCode = 'regionQuerty'
        const regionName = 'The Querty Region'

        // TODO : Introduce Mocking instead of stub implementations
        class FakeRegionProvider implements RegionProvider {
            public async getRegionData(): Promise<RegionInfo[]> {
                return [new RegionInfo(regionCode, regionName)]
            }
        }

        class FakeAwsContext implements AwsContext {
            public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
                new vscode.EventEmitter<ContextChangeEventsArgs>().event

            public async getCredentials(): Promise<AWS.Credentials | undefined> {
                throw new Error('Method not implemented.')
            }

            public getCredentialProfileName(): string | undefined {
                return 'qwerty'
            }

            public async setCredentialProfileName(profileName?: string | undefined): Promise<void> {
                throw new Error('Method not implemented.')
            }

            public async getExplorerRegions(): Promise<string[]> {
                return [regionCode]
            }

            public async addExplorerRegion(...regions: string[]): Promise<void> {
                throw new Error('Method not implemented.')
            }

            public async removeExplorerRegion(...regions: string[]): Promise<void> {
                throw new Error('Method not implemented.')
            }
        }

        class FakeResourceFetcher implements ResourceFetcher {
            public async getResource(resourceLocations: ResourceLocation[]): Promise<string> {
                throw new Error('Method not implemented.')
            }
        }

        const awsContext = new FakeAwsContext()
        const regionProvider = new FakeRegionProvider()
        const awsContextTreeCollection = new AwsContextTreeCollection()
        const resourceFetcher = new FakeResourceFetcher()
        const mockChannel = new MockOutputChannel()

        const lambdaProvider = new LambdaTreeDataProvider(
            awsContext,
            awsContextTreeCollection,
            regionProvider,
            resourceFetcher,
            (path) => { throw new Error('unused') },
            mockChannel
        )

        const treeNodesPromise = lambdaProvider.getChildren()

        assert(treeNodesPromise)
        const treeNodes = await treeNodesPromise
        assert(treeNodes)
        assert.strictEqual(treeNodes.length, 1)

        const regionNode = treeNodes[0] as RegionNode
        assert(regionNode)
        assert.strictEqual(regionNode.regionCode, regionCode)
        assert.strictEqual(regionNode.regionName, regionName)
    })
})
