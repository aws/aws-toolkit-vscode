/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext, AwsContextCredentials, ContextChangeEventsArgs } from '../../shared/awsContext'
import { Region } from '../../shared/regions/endpoints'
import { RegionProvider } from '../../shared/regions/regionProvider'

export const DEFAULT_TEST_PROFILE_NAME = 'qwerty'
export const DEFAULT_TEST_ACCOUNT_ID = '123456789012'
export const DEFAULT_TEST_PARTITION_ID = 'partitionQwerty'
export const DEFAULT_TEST_REGION_CODE = 'regionQuerty'
export const DEFAULT_TEST_REGION_NAME = 'The Querty Region'
export const DEFAULT_TEST_DNS_SUFFIX = 'querty.tld'

// TODO : Introduce Mocking instead of stub implementations
export class FakeRegionProvider implements RegionProvider {
    public readonly onRegionProviderUpdatedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onRegionProviderUpdated: vscode.Event<void> = this.onRegionProviderUpdatedEmitter.event
    public readonly servicesNotInRegion: string[] = []

    public getDnsSuffixForRegion(regionId: string): string | undefined {
        if (regionId === DEFAULT_TEST_REGION_CODE) {
            return DEFAULT_TEST_DNS_SUFFIX
        }

        return undefined
    }

    public getPartitionId(regionId: string): string | undefined {
        if (regionId === DEFAULT_TEST_REGION_CODE) {
            return DEFAULT_TEST_PARTITION_ID
        }

        return undefined
    }

    public getRegions(partitionId: string): Region[] {
        if (partitionId === DEFAULT_TEST_PARTITION_ID) {
            return [
                {
                    id: DEFAULT_TEST_REGION_CODE,
                    name: DEFAULT_TEST_REGION_NAME,
                },
            ]
        }

        return []
    }

    public isServiceInRegion(serviceId: string, regionId: string): boolean {
        return !this.servicesNotInRegion.includes(serviceId)
    }
}

export interface FakeAwsContextParams {
    contextCredentials?: AwsContextCredentials
}

const DEFAULT_REGION = 'us-east-1'
export class FakeAwsContext implements AwsContext {
    public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
        new vscode.EventEmitter<ContextChangeEventsArgs>().event
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

    public getCredentialDefaultRegion(): string {
        return this.awsContextCredentials?.defaultRegion ?? DEFAULT_REGION
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
            accountId: DEFAULT_TEST_ACCOUNT_ID,
            defaultRegion: DEFAULT_TEST_REGION_CODE,
        },
    })
}
