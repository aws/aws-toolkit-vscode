/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { AwsContext } from './awsContext'
import { env, version } from 'vscode'

export class AWSClientBuilder {

    private _awsContext: AwsContext

    constructor(awsContext: AwsContext) {
        this._awsContext = awsContext

    }

    // centralized construction of transient AWS service clients, allowing us
    // to customize requests and/or user agent
    public async createAndConfigureSdkClient(
        awsService: any,
        awsServiceOpts: any | undefined = {},
        region: string | undefined = undefined
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
