/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext, AwsContextCredentials, ContextChangeEventsArgs } from '../../shared/awsContext'
import { RegionInfo } from '../../shared/regions/regionInfo'
import { RegionProvider } from '../../shared/regions/regionProvider'

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
    contextCredentials?: AwsContextCredentials
}

export class FakeAwsContext implements AwsContext {
    public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> = new vscode.EventEmitter<
        ContextChangeEventsArgs
    >().event
    private awsContextCredentials: AwsContextCredentials | undefined

    public constructor(params?: FakeAwsContextParams) {
        this.awsContextCredentials = params?.contextCredentials
    }

    public async setCredentials(credentials?: AwsContextCredentials): Promise<void> {
        this.awsContextCredentials = credentials
    }

    public async getCredentials(): Promise<AWS.Credentials | undefined> {
        return this.awsContextCredentials?.credentials
    }

    public getCredentialProfileName(): string | undefined {
        return this.awsContextCredentials?.credentialsId
    }

    public getCredentialAccountId(): string | undefined {
        return this.awsContextCredentials?.accountId
    }

    public getCredentialDefaultRegion(): string | undefined {
        return this.awsContextCredentials?.defaultRegion
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

export function makeFakeAwsContextWithPlaceholderIds(credentials: AWS.Credentials): FakeAwsContext {
    return new FakeAwsContext({
        contextCredentials: {
            credentials: credentials,
            credentialsId: DEFAULT_TEST_PROFILE_NAME,
            accountId: DEFAULT_TEST_ACCOUNT_ID
        }
    })
}
