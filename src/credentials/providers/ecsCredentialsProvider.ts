/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, ECSCredentials } from 'aws-sdk'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from './credentials'

/**
 * Credentials received from ECS containers.
 *
 * @see CredentialsProviderType
 */
export class EcsCredentialsProvider implements CredentialsProvider {
    private credentials: ECSCredentials | undefined

    public async isAvailable(): Promise<boolean> {
        const env = process.env as EnvironmentVariables
        return env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || env.AWS_CONTAINER_CREDENTIALS_FULL_URI ? true : false
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'instance',
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'ecs'
    }

    public getProviderType(): CredentialsProviderType {
        return EcsCredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'ecsMetatdata'
    }

    public getDefaultRegion(): string | undefined {
        const env = process.env as EnvironmentVariables
        return env.AWS_DEFAULT_REGION
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.credentials))
    }

    public canAutoConnect(): boolean {
        return true
    }

    public async getCredentials(): Promise<Credentials> {
        if (!this.credentials) {
            this.credentials = new ECSCredentials()
        }
        return this.credentials
    }
}
