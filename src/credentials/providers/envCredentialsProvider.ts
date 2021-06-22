/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsProvider, CredentialsProviderType ,CredentialsId } from './credentials'


/**
 * Credentials given by environment variables.
 *
 * @see CredentialsProviderType
 */
export class EnvCredentialsProvider implements CredentialsProvider {
    public constructor(private token: string) {
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: 'default',
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'env'
    }

    public getProviderType(): CredentialsProviderType {
        return EnvCredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return 'other'  // TODO: what goes here?
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.token))
    }

    public getDefaultRegion(): string | undefined {
        return 'us-east-1'  // TODO: AWS_REGION ?
    }

    public canAutoConnect(): boolean {
        return true
    }

    public async getCredentials(): Promise<AWS.Credentials> {
        // TODO
        throw Error('not implemented')
    }
}
