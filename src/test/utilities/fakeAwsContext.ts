/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'
import { AwsContext, AwsContextCredentials, ContextChangeEventsArgs } from '../../shared/awsContext'
import { DEFAULT_TEST_REGION_CODE } from '../shared/regions/testUtil'

export const DEFAULT_TEST_PROFILE_NAME = 'qwerty'
export const DEFAULT_TEST_ACCOUNT_ID = '123456789012'

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

    public credentialsShim = {
        get: async () => ({
            accessKeyId: '',
            secretAccessKey: '',
            ...this.awsContextCredentials?.credentials,
        }),
        async refresh() {
            return this.get()
        },
    }

    public async setDeveloperMode(enable: boolean, settingName: string | undefined): Promise<void> {}

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
