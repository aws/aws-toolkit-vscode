/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Service } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import * as vscode from 'vscode'
import { AWSClientBuilder } from '../../shared/awsClientBuilder'
import { AwsContext, ContextChangeEventsArgs } from '../../shared/awsContext'

describe('AwsClientBuilder', () => {
    class FakeAwsContext implements AwsContext {
        public onDidChangeContext: vscode.Event<ContextChangeEventsArgs> =
            new vscode.EventEmitter<ContextChangeEventsArgs>().event

        public async getCredentials(): Promise<AWS.Credentials | undefined> {
            return undefined
        }

        public getCredentialProfileName(): string | undefined {
            throw new Error('Method not implemented.')
        }

        public async setCredentialProfileName(profileName?: string | undefined): Promise<void> {
            throw new Error('Method not implemented.')
        }

        public async getExplorerRegions(): Promise<string[]> {
            throw new Error('Method not implemented.')
        }

        public async addExplorerRegion(...regions: string[]): Promise<void> {
            throw new Error('Method not implemented.')
        }

        public async removeExplorerRegion(...regions: string[]): Promise<void> {
            throw new Error('Method not implemented.')
        }
    }

    describe('createAndConfigureSdkClient', () => {
        class FakeService extends Service {
            public constructor(config?: ServiceConfigurationOptions) {
                super(config)
            }
        }

        // We don't want to test against the versions reported by package.json and vscode.version--this is
        // what the product code does, so these tests would still pass with bad versions. Instead, we
        // verify that a valid semver is used. This protects us against things like `null`, `undefined`,
        // or other unexpected values.
        const semverRegex = (require('semver-regex') as () => RegExp)()
        const userAgentRegex = new RegExp(
            `^AWS-Toolkit-For-VisualStudio\\/${semverRegex.source} Visual-Studio-Code\\/${semverRegex.source}`
        )

        it('includes custom user-agent if no options are specified', async () => {
            const builder = new AWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureSdkClient(opts => new FakeService(opts))

            assert.equal(!!service.config.customUserAgent, true)
            assert.equal(userAgentRegex.test(service.config.customUserAgent!), true)
        })

        it('includes custom user-agent if not specified in options', async () => {
            const builder = new AWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureSdkClient(opts => new FakeService(opts), {})

            assert.equal(!!service.config.customUserAgent, true)
            assert.equal(userAgentRegex.test(service.config.customUserAgent!), true)
        })

        it('does not override custom user-agent if specified in options', async () => {
            const builder = new AWSClientBuilder(new FakeAwsContext())
            const service = await builder.createAndConfigureSdkClient(
                opts => new FakeService(opts),
                { customUserAgent: 'CUSTOM USER AGENT' }
            )

            assert.equal(service.config.customUserAgent, 'CUSTOM USER AGENT')
        })
    })
})
