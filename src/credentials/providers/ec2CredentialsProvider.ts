/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, EC2MetadataCredentials, MetadataService } from "aws-sdk"
import { getLogger } from '../../shared/logger'
import { CredentialType } from "../../shared/telemetry/telemetry.gen"
import { CredentialsId, CredentialsProviderType } from './credentials'
import { EnvironmentCredentialsProvider } from "./environmentCredentialsProvider"

/**
 * Credentials received from EC2 metadata service.
 *
 * @see CredentialsProviderType
 */
export class Ec2CredentialsProvider implements EnvironmentCredentialsProvider {
    private static readonly METADATA_SERVICE_TIMEOUT: number = 1000

    private credentials: EC2MetadataCredentials | undefined
    private region: string | undefined

    public constructor(
        private metadata: MetadataService = Ec2CredentialsProvider.makeMetadataService()
    ) {}

    public isAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            this.metadata.request('/latest/dynamic/instance-identity/document', (err, response) => {
                if (response) {
                    const document = JSON.parse(response)
                    this.region = document['region']
                    getLogger().verbose(`resolved instance region ${this.region} from EC2 Metadata`)
                }
                resolve(err ? false : true)
            })
        })
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'instance',
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'ec2'
    }

    public getProviderType(): CredentialsProviderType {
        return Ec2CredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'ec2Metadata'
    }

    public getDefaultRegion(): string | undefined {
        return this.region
    }

    public getHashCode(): string {
        return JSON.stringify(this.credentials)
    }

    public canAutoConnect(): boolean {
        return true
    }

    public async getCredentials(): Promise<Credentials> {
        if (!this.credentials) {
            this.credentials = new EC2MetadataCredentials()
        }
        return this.credentials
    }

    private static makeMetadataService(): MetadataService {
        return new MetadataService({
            httpOptions: {
                timeout: Ec2CredentialsProvider.METADATA_SERVICE_TIMEOUT,
                connectTimeout: Ec2CredentialsProvider.METADATA_SERVICE_TIMEOUT
            } as any
            // workaround for known bug: https://github.com/aws/aws-sdk-js/issues/3029
        })
    }
}
