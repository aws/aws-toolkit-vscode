/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { env, version } from 'vscode'
import { AwsContext } from './awsContext'

export class AWSClientBuilder {

    private readonly _awsContext: AwsContext

    public constructor(awsContext: AwsContext) {
        this._awsContext = awsContext

    }

    // centralized construction of transient AWS service clients, allowing us
    // to customize requests and/or user agent
    public async createAndConfigureSdkClient(
        awsService: any,
        awsServiceOpts: any | undefined = {},
        region?: string
    ): Promise<any> {
        if (!awsServiceOpts.credentials) {
            awsServiceOpts.credentials = await this._awsContext.getCredentials()
        }

        if (!awsServiceOpts.region && region) {
            awsServiceOpts.region = region
        }

        if (!awsServiceOpts.customUserAgent) {
            const pluginVersion: string = require('../../package.json').version
            const platformName = env.appName.replace(/\s/g, '-')
            awsServiceOpts.customUserAgent = `AWS-Toolkit-For-VisualStudio/${pluginVersion} ${platformName}/${version}`
        }

        return new awsService(awsServiceOpts)
    }
}
