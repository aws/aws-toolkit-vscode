/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { AwsContext, ContextChangeEventsArgs } from '../../shared/awsContext'
import { RegionInfo } from '../../shared/regions/regionInfo'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { ResourceFetcher } from '../../shared/resourceFetcher'
import { ResourceLocation } from '../../shared/resourceLocation'

export const DEFAULT_TEST_ACCOUNT_ID = '123456789012'
export const DEFAULT_TEST_REGION_CODE = 'regionQuerty'
export const DEFAULT_TEST_REGION_NAME = 'The Querty Region'

// TODO : Introduce Mocking instead of stub implementations
export class FakeRegionProvider implements RegionProvider {
    public async getRegionData(): Promise<RegionInfo[]> {
        return [new RegionInfo(DEFAULT_TEST_REGION_CODE, DEFAULT_TEST_REGION_NAME)]
    }
}

export class FakeAwsContext implements AwsContext {
    public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
        new vscode.EventEmitter<ContextChangeEventsArgs>().event

    private accountId: string | undefined = DEFAULT_TEST_ACCOUNT_ID

    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return undefined
    }

    public getCredentialProfileName(): string | undefined {
        return 'qwerty'
    }

    public async setCredentialProfileName(profileName?: string | undefined): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public getCredentialAccountId(): string | undefined {
        return this.accountId
    }

    // resets the context to the indicated profile, saving it into settings
    public async setCredentialAccountId(accountId?: string): Promise<void> {
        this.accountId = accountId
    }

    public async getExplorerRegions(): Promise<string[]> {
        return [DEFAULT_TEST_REGION_CODE]
    }

    public async addExplorerRegion(...regions: string[]): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public async removeExplorerRegion(...regions: string[]): Promise<void> {
        throw new Error('Method not implemented.')
    }
}

export class FakeResourceFetcher implements ResourceFetcher {
    public async getResource(resourceLocations: ResourceLocation[]): Promise<string> {
        throw new Error('Method not implemented.')
    }
}
