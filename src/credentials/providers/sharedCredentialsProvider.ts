/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { Profile } from '../../shared/credentials/credentialsFile'
import { getLogger } from '../../shared/logger'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { getMfaTokenFromUser } from '../credentialsCreator'
import { hasProfileProperty, resolveProviderWithCancel } from '../credentialsUtilities'
import { SSO_PROFILE_PROPERTIES, validateSsoProfile } from '../sso/sso'
import { DiskCache } from '../sso/diskCache'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import { CredentialsProvider, CredentialsProviderType ,CredentialsId } from './credentials'
import { SsoCredentialProvider } from './ssoCredentialProvider'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'

const SHARED_CREDENTIAL_PROPERTIES = {
    AWS_ACCESS_KEY_ID: 'aws_access_key_id',
    AWS_SECRET_ACCESS_KEY: 'aws_secret_access_key',
    AWS_SESSION_TOKEN: 'aws_session_token',
    CREDENTIAL_PROCESS: 'credential_process',
    REGION: 'region',
    ROLE_ARN: 'role_arn',
    SOURCE_PROFILE: 'source_profile',
    MFA_SERIAL: 'mfa_serial',
    SSO_START_URL: 'sso_start_url',
    SSO_REGION: 'sso_region',
    SSO_ACCOUNT_ID: 'sso_account_id',
    SSO_ROLE_NAME: 'sso_role_name',
}

/**
 * Represents one profile from the AWS Shared Credentials files.
 */
export class SharedCredentialsProvider implements CredentialsProvider {
    private readonly profile: Profile

    public constructor(
        private readonly profileName: string,
        private readonly allSharedCredentialProfiles: Map<string, Profile>
    ) {
        const profile = this.allSharedCredentialProfiles.get(profileName)

        if (!profile) {
            throw new Error(`Profile not found: ${profileName}`)
        }

        this.profile = profile
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: this.getProviderType(),
            credentialTypeId: this.profileName,
        }
    }

    public static getProviderType(): CredentialsProviderType {
        return 'profile'
    }

    public getProviderType(): CredentialsProviderType {
        return SharedCredentialsProvider.getProviderType()
    }

    public getTelemetryType(): CredentialType {
        return this.isSsoProfile() ? 'ssoProfile' : 'staticProfile'
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.profile))
    }

    public getDefaultRegion(): string | undefined {
        return this.profile[SHARED_CREDENTIAL_PROPERTIES.REGION]
    }

    public canAutoConnect(): boolean {
        return !hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.MFA_SERIAL) && !this.isSsoProfile()
    }

    /**
     * Returns undefined if the Profile is valid, else a string indicating what is invalid
     */
    public validate(): string | undefined {
        const expectedProperties: string[] = []

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN)) {
            return this.validateSourceProfileChain()
        } else if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS)) {
            // No validation. Don't check anything else.
            return undefined
        } else if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN)) {
            expectedProperties.push(
                SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID,
                SHARED_CREDENTIAL_PROPERTIES.AWS_SECRET_ACCESS_KEY
            )
        } else if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID)) {
            expectedProperties.push(SHARED_CREDENTIAL_PROPERTIES.AWS_SECRET_ACCESS_KEY)
        } else if (this.isSsoProfile()) {
            return validateSsoProfile(this.profile, this.profileName)
        } else {
            return `Profile ${this.profileName} is not supported by the Toolkit.`
        }

        const missingProperties = this.getMissingProperties(expectedProperties)
        if (missingProperties.length !== 0) {
            return `Profile ${this.profileName} is missing properties: ${missingProperties.join(', ')}`
        }

        return undefined
    }

    public async getCredentials(): Promise<AWS.Credentials> {
        // Profiles with references involving non-aws partitions need help getting the right STS endpoint
        // when resolving SharedIniFileCredentials. We set the global sts configuration with a suitable region
        // only to perform the resolve, then reset it.
        // This hack can be removed when https://github.com/aws/aws-sdk-js/issues/3088 is addressed.
        const originalStsConfiguration = AWS.config.sts

        try {
            const validationMessage = this.validate()
            if (validationMessage) {
                throw new Error(`Profile ${this.profileName} is not a valid Credential Profile: ${validationMessage}`)
            }
            // Profiles with references involving non-aws partitions need help getting the right STS endpoint
            this.applyProfileRegionToGlobalStsConfig()
            //  SSO entry point
            if (this.isSsoProfile()) {
                const ssoCredentialProvider = this.makeSsoProvider()
                return await ssoCredentialProvider.refreshCredentials()
            }
            const provider = new AWS.CredentialProviderChain([this.makeCredentialsProvider()])
            return await resolveProviderWithCancel(this.profileName, provider.resolvePromise())
        } finally {
            // Profiles with references involving non-aws partitions need help getting the right STS endpoint
            AWS.config.sts = originalStsConfiguration
        }
    }

    private getMissingProperties(propertyNames: string[]): string[] {
        return propertyNames.filter(propertyName => !this.profile[propertyName])
    }

    /**
     * Returns undefined if the Profile Chain is valid, else a string indicating what is invalid
     */
    private validateSourceProfileChain(): string | undefined {
        const profilesTraversed: string[] = [this.profileName]

        let profile = this.profile

        while (profile[SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE]) {
            const profileName = profile[SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE]!

            // Cycle
            if (profilesTraversed.includes(profileName)) {
                profilesTraversed.push(profileName)

                return `Cycle detected within Shared Credentials Profiles. Reference chain: ${profilesTraversed.join(
                    ' -> '
                )}`
            }

            profilesTraversed.push(profileName)

            // Missing reference
            if (!this.allSharedCredentialProfiles.has(profileName)) {
                return `Shared Credentials Profile ${profileName} not found. Reference chain: ${profilesTraversed.join(
                    ' -> '
                )}`
            }

            profile = this.allSharedCredentialProfiles.get(profileName)!
        }
    }

    private makeCredentialsProvider(): () => AWS.Credentials {
        const logger = getLogger()

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider()
        }

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS} - treating as Process Credentials`
            )

            return () => new AWS.ProcessCredentials({ profile: this.profileName })
        }

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider()
        }

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider()
        }

        logger.error(`Profile ${this.profileName} did not contain any supported properties`)
        throw new Error(`Shared Credentials profile ${this.profileName} is not supported`)
    }

    private makeSharedIniFileCredentialsProvider(): () => AWS.Credentials {
        return () =>
            new AWS.SharedIniFileCredentials({
                profile: this.profileName,
                tokenCodeFn: async (mfaSerial, callback) =>
                    await getMfaTokenFromUser(mfaSerial, this.profileName, callback),
            })
    }

    private makeSsoProvider() {
        // These properties are validated before reaching this method
        const ssoRegion = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_REGION]!
        const ssoUrl = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_START_URL]!

        const ssoOidcClient = new AWS.SSOOIDC({ region: ssoRegion })
        const cache = new DiskCache()
        const ssoAccessTokenProvider = new SsoAccessTokenProvider(ssoRegion, ssoUrl, ssoOidcClient, cache)

        const ssoClient = new AWS.SSO({ region: ssoRegion })
        const ssoAccount = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_ACCOUNT_ID]!
        const ssoRole = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_ROLE_NAME]!
        return new SsoCredentialProvider(ssoAccount, ssoRole, ssoClient, ssoAccessTokenProvider)
    }

    private applyProfileRegionToGlobalStsConfig() {
        if (!AWS.config.sts) {
            AWS.config.sts = {}
        }

        AWS.config.sts.region = this.getDefaultRegion()
    }

    public isSsoProfile(): boolean {
        for (const propertyName of SSO_PROFILE_PROPERTIES) {
            if (hasProfileProperty(this.profile, propertyName)) {
                return true
            }
        }
        return false
    }
}
