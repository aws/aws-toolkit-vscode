/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SecretsManager } from 'aws-sdk'
import globals from '../extensionGlobals'
import { GetSecretValueRequest, GetSecretValueResponse } from 'aws-sdk/clients/secretsmanager'

export class SecretsManagerClient {
    public constructor(
        public readonly regionCode: string,
        private readonly secretsManagerClientProvider: (
            regionCode: string
        ) => Promise<SecretsManager> = createSecretsManagerClient
    ) {}

    /**
     * Retrieves the contents of the encrypted fields SecretString or SecretBinary from the secrets manager
     * @param secretId : the secret name
     * @returns the secret value response
     */
    public async getSecretValue(secretId: string): Promise<GetSecretValueResponse> {
        const secretsManagerClient = await this.secretsManagerClientProvider(this.regionCode)
        const request: GetSecretValueRequest = {
            SecretId: secretId,
        }
        return secretsManagerClient.getSecretValue(request).promise()
    }
}

async function createSecretsManagerClient(regionCode: string): Promise<SecretsManager> {
    return await globals.sdkClientBuilder.createAwsService(SecretsManager, { computeChecksums: true }, regionCode)
}
