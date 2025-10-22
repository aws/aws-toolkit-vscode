/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import type { AssumeRoleRequest, AssumeRoleResponse, GetCallerIdentityResponse } from '@aws-sdk/client-sts'
import { AwsCredentialIdentityProvider } from '@smithy/types'
import { Credentials } from '@aws-sdk/types'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type { GetCallerIdentityResponse }
export type StsClient = ClassToInterfaceType<DefaultStsClient>

// Helper function to convert Credentials to AwsCredentialIdentityProvider
function toCredentialProvider(credentials: Credentials | AwsCredentialIdentityProvider): AwsCredentialIdentityProvider {
    if (typeof credentials === 'function') {
        return credentials
    }
    // Convert static credentials to provider function
    return async () => credentials
}

export class DefaultStsClient {
    public constructor(
        public readonly regionCode: string,
        private readonly credentials?: Credentials | AwsCredentialIdentityProvider,
        private readonly endpointUrl?: string
    ) {}

    public async assumeRole(request: AssumeRoleRequest): Promise<AssumeRoleResponse> {
        const sdkClient = this.createSdkClient()
        const response = await sdkClient.send(new AssumeRoleCommand(request))
        return response
    }

    public async getCallerIdentity(): Promise<GetCallerIdentityResponse> {
        const sdkClient = this.createSdkClient()
        const response = await sdkClient.send(new GetCallerIdentityCommand({}))
        return response
    }

    private createSdkClient(): STSClient {
        const clientOptions: { region: string; endpoint?: string; credentials?: AwsCredentialIdentityProvider } = {
            region: this.regionCode,
        }

        if (this.endpointUrl) {
            clientOptions.endpoint = this.endpointUrl
        }

        if (this.credentials) {
            clientOptions.credentials = toCredentialProvider(this.credentials)
        }

        return globals.sdkClientBuilderV3.createAwsService({
            serviceClient: STSClient,
            clientOptions,
        })
    }
}
