/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, EnvironmentCredentials } from 'aws-sdk'
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
    public static readonly AWS_ENV_VAR_PREFIX: string = 'AWS'

    private credentials: EnvironmentCredentials | undefined

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

    public canAutoConnect(): boolean {
        return true
    }

    public async getCredentials(): Promise<Credentials> {
        if (!this.credentials) {
            this.credentials = new EnvironmentCredentials(EnvVarsCredentialsProvider.AWS_ENV_VAR_PREFIX)
        }
        return this.credentials
    }
}
