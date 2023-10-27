/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    AssumeRoleCommandInput,
    AssumeRoleCommandOutput,
    GetCallerIdentityCommandOutput,
    STS,
} from "@aws-sdk/client-sts";

import { Credentials } from '@aws-sdk/types'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type StsClient = ClassToInterfaceType<DefaultStsClient>
export class DefaultStsClient {
    public constructor(public readonly regionCode: string, private readonly credentials?: Credentials) {}

    public async assumeRole(request: AssumeRoleCommandInput): Promise<AssumeRoleCommandOutput> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.assumeRole(request).promise()
        return response
    }

    public async getCallerIdentity(): Promise<GetCallerIdentityCommandOutput> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.getCallerIdentity().promise()
        return response
    }

    private async createSdkClient(): Promise<STS> {
        return await globals.sdkClientBuilder.createAwsService(
            STS,
            {
                credentials: this.credentials,
                stsRegionalEndpoints: 'regional',
            },
            this.regionCode
        )
    }
}
