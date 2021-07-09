/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as telemetry from '../../shared/telemetry/telemetry.gen'

const CREDENTIALS_PROVIDER_ID_SEPARATOR = ':'

/**
 * "Fully-qualified" credentials structure (source + name).
 */
export interface CredentialsId {
    /** Credentials source id, e.g. "sharedCredentials". */
    readonly credentialSource: CredentialsProviderType
    /** User-defined profile name, e.g. "default". */
    readonly credentialTypeId: string
}

/**
 * Gets the string form of the given `CredentialsProvider`.
 *
 * For use in e.g. the statusbar, menus, etc.  Includes:
 * - credentials source kind
 * - instance-identifying information (typically the "profile name")
 *
 * @param credentials  Value to be formatted.
 */
export function asString(credentials: CredentialsId): string {
    return [credentials.credentialSource, credentials.credentialTypeId].join(
        CREDENTIALS_PROVIDER_ID_SEPARATOR
    )
}

export function fromString(credentials: string): CredentialsId {
    const separatorPos = credentials.indexOf(CREDENTIALS_PROVIDER_ID_SEPARATOR)

    if (separatorPos === -1) {
        throw new Error(`Unexpected credentialsId format: ${credentials}`)
    }

    const credSource = credentials.substring(0, separatorPos)
    if (!credentialsProviderType.includes(credSource as any)) {
        throw new Error(`unexpected credential source: ${credSource}`)
    }

    return {
        credentialSource: credSource as CredentialsProviderType,
        credentialTypeId: credentials.substring(separatorPos + 1),
    }
}

export function isEqual(idA: CredentialsId, idB: CredentialsId): boolean {
    return idA.credentialSource === idB.credentialSource && idA.credentialTypeId === idB.credentialTypeId
}


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

export interface CredentialsProvider {
    getCredentialsId(): CredentialsId
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
    getTelemetryType(): telemetry.CredentialType
    getDefaultRegion(): string | undefined
    getHashCode(): string
    getCredentials(): Promise<AWS.Credentials>
    /**
     * Decides if the credential is the kind that may be auto-connected at
     * first use (in particular, credentials that may prompt, such as SSO/MFA,
     * should _not_ attempt to auto-connect).
     */
    canAutoConnect(): boolean
    /**
     * Determines if the provider is currently capable of producing credentials.
     */
    isAvailable(): Promise<boolean>
}
