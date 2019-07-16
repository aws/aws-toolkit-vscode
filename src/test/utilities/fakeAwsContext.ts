/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext, ContextChangeEventsArgs } from '../../shared/awsContext'
import { RegionInfo } from '../../shared/regions/regionInfo'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { ResourceFetcher } from '../../shared/resourceFetcher'
import { ResourceLocation } from '../../shared/resourceLocation'

export const DEFAULT_TEST_PROFILE_NAME = 'qwerty'
export const DEFAULT_TEST_ACCOUNT_ID = '123456789012'
export const DEFAULT_TEST_REGION_CODE = 'regionQuerty'
export const DEFAULT_TEST_REGION_NAME = 'The Querty Region'

// TODO : Introduce Mocking instead of stub implementations
export class FakeRegionProvider implements RegionProvider {
    public async getRegionData(): Promise<RegionInfo[]> {
        return [new RegionInfo(DEFAULT_TEST_REGION_CODE, DEFAULT_TEST_REGION_NAME)]
    }
}

export interface FakeAwsContextParams {
    credentials?: AWS.Credentials,
    profileName?: string,
    accountId?: string,
    allowUndefined?: boolean
}

export class FakeAwsContext implements AwsContext {

    public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
        new vscode.EventEmitter<ContextChangeEventsArgs>().event
    private readonly credentials: AWS.Credentials | undefined
    private accountId: string | undefined
    private profileName: string | undefined

    public constructor(params?: FakeAwsContextParams) {
        if (params && params.allowUndefined) {
            this.credentials = params.credentials ? params.credentials : undefined
            this.accountId = params.accountId ? params.accountId : undefined
            this.profileName = params.profileName ? params.profileName :  undefined
        } else {
            this.credentials = (params && params.credentials) ? params.credentials : undefined
            this.accountId = (params && params.accountId) ? params.accountId : DEFAULT_TEST_ACCOUNT_ID
            this.profileName = (params && params.profileName) ? params.profileName :  DEFAULT_TEST_PROFILE_NAME
        }
    }

    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return this.credentials
    }

    public getCredentialProfileName(): string | undefined {
        return this.profileName
    }

    public async setCredentialProfileName(profileName?: string | undefined): Promise<void> {
        this.profileName = profileName
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
