/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SecretsManager } from 'aws-sdk'
import globals from '../extensionGlobals'
import { ListSecretsRequest, ListSecretsResponse } from 'aws-sdk/clients/secretsmanager'

export class SecretsManagerClient {
    public constructor(
        public readonly regionCode: string,
        private readonly secretsManagerClientProvider: (
            regionCode: string
        ) => Promise<SecretsManager> = createSecretsManagerClient
    ) {}

    /**
     * Lists the secrets that are stored by Secrets Manager
     * @param filter tagged key filter value
     * @returns a list of the secrets
     */
    public async listSecrets(filter: string): Promise<ListSecretsResponse> {
        const secretsManagerClient = await this.secretsManagerClientProvider(this.regionCode)
        const request: ListSecretsRequest = {
            IncludePlannedDeletion: false,
            Filters: [
                {
                    Key: 'tag-key',
                    Values: [filter],
                },
            ],
            SortOrder: 'desc',
        }
        return secretsManagerClient.listSecrets(request).promise()
    }
}

async function createSecretsManagerClient(regionCode: string): Promise<SecretsManager> {
    return await globals.sdkClientBuilder.createAwsService(SecretsManager, { computeChecksums: true }, regionCode)
}
