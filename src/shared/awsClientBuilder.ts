/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { env, version } from 'vscode'
import { AwsContext } from './awsContext'
import * as constants from './constants'

export interface AWSClientBuilder {
    createAndConfigureServiceClient<T>(
        awsServiceFactory: (options: ServiceConfigurationOptions) => T,
        awsServiceOpts?: ServiceConfigurationOptions,
        region?: string
    ): Promise<T>
}

export class DefaultAWSClientBuilder implements AWSClientBuilder {
    private readonly _awsContext: AwsContext

    public constructor(awsContext: AwsContext) {
        this._awsContext = awsContext
    }

    // centralized construction of transient AWS service clients, allowing us
    // to customize requests and/or user agent
    public async createAndConfigureServiceClient<T>(
        awsServiceFactory: (options: ServiceConfigurationOptions) => T,
        awsServiceOpts?: ServiceConfigurationOptions,
        region?: string
    ): Promise<T> {
        if (!awsServiceOpts) {
            awsServiceOpts = {}
        }

        if (!awsServiceOpts.credentials) {
            awsServiceOpts.credentials = await this._awsContext.getCredentials()
        }

        if (!awsServiceOpts.region && region) {
            awsServiceOpts.region = region
        }

        if (!awsServiceOpts.customUserAgent) {
            const platformName = env.appName.replace(/\s/g, '-')
            const pluginVersion = constants.pluginVersion
            awsServiceOpts.customUserAgent = `AWS-Toolkit-For-VSCode/${pluginVersion} ${platformName}/${version}`
        }

        return awsServiceFactory(awsServiceOpts)
    }
}
