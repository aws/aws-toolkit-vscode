/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CreateSecretCommand,
    CreateSecretRequest,
    CreateSecretResponse,
    ListSecretsCommand,
    ListSecretsRequest,
    ListSecretsResponse,
    SecretsManagerClient as SecretsManagerSdkClient,
} from '@aws-sdk/client-secrets-manager'
import globals from '../extensionGlobals'
import { productName } from '../constants'

export class SecretsManagerClient {
    public constructor(
        public readonly regionCode: string,
        private readonly secretsManagerClientProvider: (
            regionCode: string
        ) => SecretsManagerSdkClient = createSecretsManagerClient
    ) {}

    /**
     * Lists the secrets that are stored by Secrets Manager
     * @param filter tagged key filter value
     * @returns a list of the secrets
     */
    public async listSecrets(filter: string): Promise<ListSecretsResponse> {
        const secretsManagerClient = this.secretsManagerClientProvider(this.regionCode)
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
        return secretsManagerClient.send(new ListSecretsCommand(request))
    }

    public async createSecret(secretString: string, username: string, password: string): Promise<CreateSecretResponse> {
        const secretsManagerClient = this.secretsManagerClientProvider(this.regionCode)
        const request: CreateSecretRequest = {
            Description: `Database secret created with ${productName}`,
            Name: secretString ? secretString : '',
            SecretString: JSON.stringify({ username, password }),
            Tags: [
                {
                    Key: 'Service',
                    Value: 'Redshift',
                },
                {
                    Key: 'Request-Source',
                    Value: productName,
                },
            ],
            ForceOverwriteReplicaSecret: true,
        }
        return secretsManagerClient.send(new CreateSecretCommand(request))
    }
}

function createSecretsManagerClient(regionCode: string): SecretsManagerSdkClient {
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: SecretsManagerSdkClient,
        clientOptions: { region: regionCode },
    })
}
