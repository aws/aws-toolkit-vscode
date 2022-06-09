/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import { STS } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CancellationToken } from 'vscode'
import { addCancellationToken, RequestExtras } from '../awsClientBuilder'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type StsClient = ClassToInterfaceType<DefaultStsClient>
export class DefaultStsClient {
    public constructor(
        public readonly regionCode: string,
        private readonly credentials?: ServiceConfigurationOptions
    ) {}

    public async assumeRole(request: STS.AssumeRoleRequest): Promise<STS.AssumeRoleResponse> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.assumeRole(request).promise()
        return response
    }

    public async getCallerIdentity(): Promise<STS.GetCallerIdentityResponse> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.getCallerIdentity().promise()
        return response
    }

    public async getFederationToken(
        request: Partial<STS.GetFederationTokenRequest> = {},
        cancellationToken?: CancellationToken
    ): Promise<STS.GetFederationTokenResponse & { Credentials: STS.Credentials }> {
        const sdkClient = await this.createSdkClient()
        const req = sdkClient.getFederationToken({
            Name: 'FederationViaAWSToolkitForVSCode',
            DurationSeconds: 900,
            PolicyArns: [{ arn: 'arn:aws:iam::aws:policy/AdministratorAccess' }],
            ...request,
        })

        if (cancellationToken) {
            addCancellationToken(cancellationToken)(req as unknown as typeof req & RequestExtras)
        }

        const response = await req.promise()

        if (!response.Credentials) {
            throw new Error('"getFederationToken" returned invalid credentials')
        }

        return response as STS.GetFederationTokenResponse & { Credentials: STS.Credentials }
    }

    private async createSdkClient(): Promise<STS> {
        return await globals.sdkClientBuilder.createAwsService(
            STS,
            {
                ...this.credentials,
                stsRegionalEndpoints: 'regional',
            },
            this.regionCode
        )
    }
}
