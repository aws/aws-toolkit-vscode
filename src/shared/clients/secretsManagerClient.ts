/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SecretsManager } from 'aws-sdk'
import globals from '../extensionGlobals'
import { ListSecretsRequest, ListSecretsResponse } from 'aws-sdk/clients/secretsmanager'
import { ConnectionParams } from '../../redshift/models/models'

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

    public genUniqueId(connectionParams: ConnectionParams): string {
        const dateStr = Date.now().toString(36) // convert num to base 36 and stringify
        return `${dateStr}-${connectionParams.password}`
    }

    public async createSecretArn(connectionParams: ConnectionParams): Promise<string> {
        /*
            create a secrete arn for the username and password entered through the Database Username and Password authentication
        */
        const username = connectionParams.username
        const password = connectionParams.password
        const secretsManagerClient = await this.secretsManagerClientProvider(this.regionCode)
        const request: SecretsManager.CreateSecretRequest = {
            Description: 'My test database secret created with the CLI',
            Name: this.genUniqueId(connectionParams) ? this.genUniqueId(connectionParams) : '',
            SecretString: JSON.stringify({ username, password }),
            Tags: [
                {
                    Key: 'Service',
                    Value: 'Redshift',
                },
                {
                    Key: 'Request-Source',
                    Value: 'Vscode',
                },
            ],
            ForceOverwriteReplicaSecret: true,
        }
        try {
            const response: SecretsManager.CreateSecretResponse = await secretsManagerClient
                .createSecret(request)
                .promise()
            if (response && response.ARN) {
                return response.ARN
            }
            throw new Error('Secret Arn not created')
        } catch (error) {
            console.error('Error creating secret in AWS Secrets Manager:', error)
            throw error
        }
    }
}

async function createSecretsManagerClient(regionCode: string): Promise<SecretsManager> {
    return await globals.sdkClientBuilder.createAwsService(SecretsManager, { computeChecksums: true }, regionCode)
}
