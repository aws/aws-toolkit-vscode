/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from '@aws-sdk/types'
import { fromEnv } from '@aws-sdk/credential-provider-env'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from './credentials'

/**
 * Credentials given by environment variables.
 *
 * @see CredentialsProviderType
 */
export class EnvVarsCredentialsProvider implements CredentialsProvider {
    private credentials: Credentials | undefined

    public async isAvailable(): Promise<boolean> {
        const env = process.env as EnvironmentVariables
        return env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? true : false
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'variables',
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'env'
    }

    public getProviderType(): CredentialsProviderType {
        return EnvVarsCredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'other'
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.credentials))
    }

    public getDefaultRegion(): string | undefined {
        const env = process.env as EnvironmentVariables
        return env.AWS_REGION
    }

    public async canAutoConnect(): Promise<boolean> {
        return true
    }

    public async getCredentials(): Promise<Credentials> {
        if (!this.credentials) {
            this.credentials = await fromEnv()()
        }
        return this.credentials
    }
}
