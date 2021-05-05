/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { CredentialsProviderId } from './credentialsProviderId'
import * as telemetry from '../../shared/telemetry/telemetry.gen'

/**
 * Credentials source type, broadly describes the kind of thing that supplied the credentials.
 * 
 * - "profile" is the most common, this is understood as a profile defined in
 *   `~/.aws/credentials` or something like it, which may be authenticated via
 *   static values, SSO, MFA, etc.
 * - "ec2" or "ecs" means "instance credentials" given by the EC2/ECS "metadata service"
 *   magic endpoint.
 *   https://docs.aws.amazon.com/sdkref/latest/guide/setting-global-credential_source.html
 * - "env" means we read the credentials from `AWS_XX` environment variables.
 *   https://docs.aws.amazon.com/sdkref/latest/guide/environment-variables.html
 *
 * Compare the similar concept `telemetry.CredentialSourceId`.
 */
export type CredentialsProviderType = typeof credentialsProviderType[number];
export const credentialsProviderType = ['profile', 'ec2', 'ecs', 'env'] as const;

/**
 * Lossy map of CredentialsProviderType to telemetry.CredentialSourceId
 */
export function credentialsProviderToTelemetryType(o: CredentialsProviderType): telemetry.CredentialSourceId {
    switch(o) {
        case 'ec2':
        case 'ecs':
            return 'ec2'
        case 'env':
            return 'envVars'
        case 'profile':
            return 'sharedCredentials'
        default:
            return 'other'
    }
}
    
export type CredentialSourceId = 'sharedCredentials' | 'sdkStore' | 'ec2' | 'envVars' | 'other'

export interface CredentialsProvider {
    getCredentialsProviderId(): CredentialsProviderId
    /**
     * Gets the credential provider type, a coarser form of
     * telemetry.CredentialSourceId for use in config files and UIs. #1725
     *
     * Compare getCredentialsType(). A single _provider_ serves many types of credentials.
     *
     * @see telemetry.CredentialSourceId
     */
    getProviderType(): CredentialsProviderType
    /**
     * Gets the credential type, for use in telemetry.  This is more granular than 
     *
     * Compare getCredentialsProviderType() which is type of the _provider_.
     */
    getTelemetryType(): CredentialType
    getDefaultRegion(): string | undefined
    getHashCode(): string
    getCredentials(): Promise<AWS.Credentials>
    /**
     * Decides if the credential is the kind that may be auto-connected at
     * first use (in particular, credentials that may prompt, such as SSO/MFA,
     * should _not_ attempt to auto-connect).
     */
    canAutoConnect(): boolean
}
