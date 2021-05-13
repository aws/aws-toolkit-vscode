/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { env, version } from 'vscode'
import { AwsContext } from './awsContext'
import { pluginVersion } from './extensionUtilities'

export interface AWSClientBuilder {
    /**
     * Creates AWS service object of the given type, and sets options defaults.
     *
     * @param type  AWS service type
     * @param options  AWS service configuration options
     * @param region  AWS region override
     * @param userAgent  Set the Toolkit user agent
     * @returns
     */
    createAwsService<T extends AWS.Service>(
        type: new (o: ServiceConfigurationOptions) => T,
        options?: ServiceConfigurationOptions,
        region?: string,
        userAgent?: boolean
    ): Promise<T>
}

export class DefaultAWSClientBuilder implements AWSClientBuilder {
    private readonly _awsContext: AwsContext

    public constructor(awsContext: AwsContext) {
        this._awsContext = awsContext
    }

    /** @inheritdoc */
    public async createAwsService<T extends AWS.Service>(
        type: new (o: ServiceConfigurationOptions) => T,
        options?: ServiceConfigurationOptions,
        region?: string,
        userAgent: boolean = true
    ): Promise<T> {
        const opt = { ...options } as ServiceConfigurationOptions

        if (!opt.credentials) {
            opt.credentials = await this._awsContext.getCredentials()
        }

        if (!opt.region && region) {
            opt.region = region
        }

        if (userAgent && !opt.customUserAgent) {
            const platformName = env.appName.replace(/\s/g, '-')
            opt.customUserAgent = `AWS-Toolkit-For-VSCode/${pluginVersion} ${platformName}/${version}`
        }

        const service = new type(opt)
        return service
    }
}
