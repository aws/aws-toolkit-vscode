/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import * as mde from '../../../types/clientmde'
import apiConfig = require('../../../types/REMOVED.normal.json')
import { ext } from '../../shared/extensionGlobals'
import * as logger from '../logger/logger'

export const MDE_REGION = 'us-east-1'
export const MDE_ENDPOINT = 'https://r2g9qfgh3d.execute-api.us-east-1.amazonaws.com/prod'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MdeEnvironment extends mde.EnvironmentSummary {}

async function createMdeClient(regionCode: string = MDE_REGION, endpoint: string = MDE_ENDPOINT): Promise<mde> {
    const c = (await ext.sdkClientBuilder.createAwsService(AWS.Service, {
        // apiConfig is internal and not in the TS declaration file
        apiConfig: apiConfig,
        region: regionCode,
        // credentials: credentials,
        correctClockSkew: true,
        endpoint: endpoint,
    } as ServiceConfigurationOptions)) as mde
    // c.setupRequestListeners()
    return c
}

export class MdeClient {
    private readonly log: logger.Logger

    public constructor(private readonly regionCode: string, private readonly endpoint: string, private sdkClient: mde) {
        this.log = logger.getLogger()
    }

    /**
     * Factory to create a new `MdeClient`.
     *
     * @note Call `onCredentialsChanged()` before making requests.
     */
    public static async create(regionCode: string = MDE_REGION, endpoint: string = MDE_ENDPOINT): Promise<MdeClient> {
        MdeClient.assertExtInitialized()
        const sdkClient = await createMdeClient(regionCode, endpoint)
        const c = new MdeClient(regionCode, endpoint, sdkClient)
        return c
    }

    private static assertExtInitialized() {
        if (!ext.sdkClientBuilder) {
            throw Error('ext.sdkClientBuilder must be initialized first')
        }
    }

    public async onCredentialsChanged(username: string | undefined) {
        MdeClient.assertExtInitialized()
        this.sdkClient = await createMdeClient(this.regionCode, this.endpoint)
    }

    public async call<T>(req: AWS.Request<T, AWS.AWSError>, silent: boolean = false, defaultVal?: T): Promise<T> {
        const log = this.log
        return new Promise<T>((resolve, reject) => {
            req.send(function (err, data) {
                if (err) {
                    log.error('API request failed: %O', err)
                    if (silent && defaultVal) {
                        resolve(defaultVal)
                    } else if (silent) {
                        resolve({ length: 0, items: undefined } as unknown as T)
                    } else {
                        reject(err)
                    }
                }
                log.verbose('API response: %O', data)
                resolve(data)
            })
        })
    }

    public async *listEnvironments(
        args: mde.ListEnvironmentsRequest
    ): AsyncIterableIterator<MdeEnvironment | undefined> {
        const c = this.sdkClient
        const r = await this.call(c.listEnvironments(args))
        for (const i of r.environmentSummaries ?? []) {
            yield i
        }
    }

    public async createEnvironment(args: mde.CreateEnvironmentRequest): Promise<MdeEnvironment | undefined> {
        const c = this.sdkClient
        const r = await this.call(c.createEnvironment(args))
        return r
    }
}
