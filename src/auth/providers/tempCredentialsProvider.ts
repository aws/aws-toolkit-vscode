/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from '@aws-sdk/types'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from './credentials'
import { StaticProfile } from '../credentials/types'
import { Auth } from '../auth'

/**
 * HACK: A credentials provider for a temporary use case.
 *
 * This provides the bare minimum way to use credentials
 * in the rest of the system.
 *
 * It is currently only used in {@link Auth} and is hidden
 * within the class.
 */
export class TempCredentialProvider implements CredentialsProvider {
    private credentials: StaticProfile
    constructor(data: StaticProfile) {
        this.credentials = {
            aws_access_key_id: data.aws_access_key_id,
            aws_secret_access_key: data.aws_secret_access_key,
        }
    }

    public async isAvailable(): Promise<boolean> {
        return true
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: this.getHashCode(),
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'temp'
    }

    public getProviderType(): CredentialsProviderType {
        return TempCredentialProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'other'
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.credentials))
    }

    public getDefaultRegion(): string | undefined {
        return undefined
    }

    public async canAutoConnect(): Promise<boolean> {
        return false
    }

    public async getCredentials(): Promise<Credentials> {
        return {
            accessKeyId: this.credentials.aws_access_key_id,
            secretAccessKey: this.credentials.aws_secret_access_key,
        }
    }
}
