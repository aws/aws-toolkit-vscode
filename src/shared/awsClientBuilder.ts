/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, AWSError } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { env, version } from 'vscode'
import { AwsContext } from './awsContext'
import { extensionVersion } from './vscode/env'

interface RequestExtras {
    readonly service: AWS.Service
    readonly operation: string
    readonly params?: any
}

type RequestListener = (request: AWS.Request<any, AWSError> & RequestExtras) => void
type ServiceOptions = ServiceConfigurationOptions & { requestListeners?: RequestListener[] }

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
        options?: ServiceOptions,
        region?: string,
        userAgent?: boolean
    ): Promise<T>
}

export class DefaultAWSClientBuilder implements AWSClientBuilder {
    private readonly _awsContext: AwsContext

    public constructor(awsContext: AwsContext) {
        this._awsContext = awsContext
    }

    public async createAwsService<T extends AWS.Service>(
        type: new (o: ServiceConfigurationOptions) => T,
        options?: ServiceOptions,
        region?: string,
        userAgent: boolean = true
    ): Promise<T> {
        const listeners = options?.requestListeners ?? []
        const opt = { ...options }
        delete opt.requestListeners

        if (!opt.credentials) {
            opt.credentials = await this._awsContext.getCredentials()
        }

        if (!opt.region && region) {
            opt.region = region
        }

        if (userAgent && !opt.customUserAgent) {
            const platformName = env.appName.replace(/\s/g, '-')
            opt.customUserAgent = `AWS-Toolkit-For-VSCode/${extensionVersion} ${platformName}/${version}`
        }

        const service = new type(opt)
        const originalSetup = service.setupRequestListeners.bind(service)

        service.setupRequestListeners = (request: Request<any, AWSError>) => {
            originalSetup(request)
            listeners.forEach(l => l(request as AWS.Request<any, AWSError> & RequestExtras))
        }

        return service
    }
}
