/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as AWS from 'aws-sdk'
import * as vscode from 'vscode'
import { RegionNode } from '../lambda/explorer/regionNode'
import { LambdaProvider } from '../lambda/lambdaProvider'
import { AwsContext, ContextChangeEventsArgs } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { RegionInfo } from '../shared/regions/regionInfo'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { ResourceLocation } from '../shared/resourceLocation'

suite('LambdaProvider Tests', function(): void {

    test('region nodes display the user-friendly region name', async function() {

        const regionCode = 'regionQuerty'
        const regionName = 'The Querty Region'

        // TODO : Introduce Mocking instead of stub implementations
        class FakeRegionProvider implements RegionProvider {
            public getRegionData(): Promise<RegionInfo[]> {
                return Promise.resolve([new RegionInfo(regionCode, regionName)])
            }
        }

        class FakeAwsContext implements AwsContext {
            public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
                new vscode.EventEmitter<ContextChangeEventsArgs>().event
            public getCredentials(): Promise<AWS.Credentials | undefined> {
                throw new Error('Method not implemented.')
            }
            public getCredentialProfileName(): string | undefined {
                return 'qwerty'
            }
            public setCredentialProfileName(profileName?: string | undefined): Promise<void> {
                throw new Error('Method not implemented.')
            }
            public getExplorerRegions(): Promise<string[]> {
                const regions = []
                regions.push(regionCode)

                return Promise.resolve(regions)
            }
            public addExplorerRegion(region: string | string[]): Promise<void> {
                throw new Error('Method not implemented.')
            }
            public removeExplorerRegion(region: string | string[]): Promise<void> {
                throw new Error('Method not implemented.')
            }
        }

        class FakeResourceFetcher implements ResourceFetcher {
            public getResource(resourceLocations: ResourceLocation[]): Promise<string> {
                throw new Error('Method not implemented.')
            }
        }

        const awsContext = new FakeAwsContext()
        const regionProvider = new FakeRegionProvider()
        const awsContextTreeCollection = new AwsContextTreeCollection()
        const resourceFetcher = new FakeResourceFetcher()

        const lambdaProvider = new LambdaProvider(awsContext, awsContextTreeCollection, regionProvider, resourceFetcher)

        const treeNodesPromise = lambdaProvider.getChildren()

        assert(treeNodesPromise)
        const treeNodes = await treeNodesPromise
        assert(treeNodes)
        assert.equal(treeNodes.length, 1)

        const regionNode = treeNodes[0] as RegionNode
        assert(regionNode)
        assert.equal(regionNode.regionCode, regionCode)
        assert.equal(regionNode.regionName, regionName)
    })
})
