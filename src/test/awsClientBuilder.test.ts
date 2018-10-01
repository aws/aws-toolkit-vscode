/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { AWSClientBuilder } from '../shared/awsClientBuilder'
import { AwsContext, ContextChangeEventsArgs } from '../shared/awsContext'

suite('AwsClientBuilder Tests', () => {
    class FakeAwsContext implements AwsContext {
        public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
            new vscode.EventEmitter<ContextChangeEventsArgs>().event
        public getCredentials(): Promise<AWS.Credentials | undefined> {
            return Promise.resolve(undefined)
        }
        public getCredentialProfileName(): string | undefined {
            throw new Error('Method not implemented.')
        }
        public setCredentialProfileName(profileName?: string | undefined): Promise<void> {
            throw new Error('Method not implemented.')
        }
        public getExplorerRegions(): Promise<string[]> {
            throw new Error('Method not implemented.')
        }
        public addExplorerRegion(region: string | string[]): Promise<void> {
            throw new Error('Method not implemented.')
        }
        public removeExplorerRegion(region: string | string[]): Promise<void> {
            throw new Error('Method not implemented.')
        }
    }

    class FakeService {
        public constructor(public config: any) {
        }
    }

    // We don't want to test against the versions reported by package.json and vscode.version--this is
    // what the product code does, so these tests would still pass with bad versions. Instead, we
    // verify that a valid semver is used. This protects us against things like `null`, `undefined`,
    // or other unexpected values.
    const semverRegex = require('semver-regex')() as RegExp
    const userAgentRegex = new RegExp(
        `^AWS-Toolkit-For-VisualStudio\\/${semverRegex.source} Visual-Studio-Code\\/${semverRegex.source}`
    )

    test('createAndConfigureSdkClient includes custom user-agent if no options are specified', async () => {
        const builder = new AWSClientBuilder(new FakeAwsContext())
        const service = await builder.createAndConfigureSdkClient(FakeService)

        assert.equal(userAgentRegex.test(service.config.customUserAgent), true)
    })

    test('createAndConfigureSdkClient includes custom user-agent if not specified in options', async () => {
        const builder = new AWSClientBuilder(new FakeAwsContext())
        const service = await builder.createAndConfigureSdkClient(FakeService, {})

        assert.equal(userAgentRegex.test(service.config.customUserAgent), true)
    })

    test('createAndConfigureSdkClient does not override custom user-agent if specified in options', async () => {
        const builder = new AWSClientBuilder(new FakeAwsContext())
        const service = await builder.createAndConfigureSdkClient(FakeService, { customUserAgent: 'CUSTOM USER AGENT' })

        assert.equal(service.config.customUserAgent, 'CUSTOM USER AGENT')
    })
})
