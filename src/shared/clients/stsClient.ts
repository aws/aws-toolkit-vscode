/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { STS } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ext } from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type StsClient = ClassToInterfaceType<DefaultStsClient>
export class DefaultStsClient {
    public constructor(
        public readonly regionCode: string,
        private readonly credentials?: ServiceConfigurationOptions
    ) {}

    public async getCallerIdentity(): Promise<STS.GetCallerIdentityResponse> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.getCallerIdentity().promise()
        return response
    }

    private async createSdkClient(): Promise<STS> {
        return await ext.sdkClientBuilder.createAwsService(
            STS,
            {
                ...this.credentials,
                stsRegionalEndpoints: 'regional',
            },
            this.regionCode
        )
    }
}
