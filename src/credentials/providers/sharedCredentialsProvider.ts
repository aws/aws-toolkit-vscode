/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from '@aws-sdk/types'
import { AssumeRoleParams, fromIni,  } from '@aws-sdk/credential-provider-ini'
import { fromProcess } from '@aws-sdk/credential-provider-process'
import { ParsedIniData, SharedConfigFiles } from '@aws-sdk/shared-ini-file-loader'
import { SSO } from '@aws-sdk/client-sso'
import { SSOOIDC } from '@aws-sdk/client-sso-oidc'
import { chain } from '@aws-sdk/property-provider'

import { Profile } from '../../shared/credentials/credentialsFile'
import { getLogger } from '../../shared/logger'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { getMfaTokenFromUser } from '../credentialsCreator'
import { hasProfileProperty, resolveProviderWithCancel } from '../credentialsUtilities'
import { SSO_PROFILE_PROPERTIES, validateSsoProfile } from '../sso/sso'
import { DiskCache } from '../sso/diskCache'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import { CredentialsProvider } from './credentialsProvider'
import { CredentialsProviderId } from './credentialsProviderId'
import { SsoCredentialProvider } from './ssoCredentialProvider'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { ext } from '../../shared/extensionGlobals'

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
 * Represents one profile from the AWS Shared Credentials files, and produces Credentials from this profile.
 */
export class SharedCredentialsProvider implements CredentialsProvider {
    private static readonly CREDENTIALS_TYPE = 'profile'

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

    public getCredentialsProviderId(): CredentialsProviderId {
        return {
            credentialType: SharedCredentialsProvider.getCredentialsType(),
            credentialTypeId: this.profileName,
        }
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.profile))
    }

    public getDefaultRegion(): string | undefined {
        return this.profile[SHARED_CREDENTIAL_PROPERTIES.REGION]
    }

    /**
     * Decides if the credential is the kind that may be auto-connected at
     * first use (in particular, credentials that may prompt, such as SSO/MFA,
     * should _not_ attempt to auto-connect).
     */
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

    // Patch source profiles so the SDK doesn't need to worry about resolving profile chains.
    private async patchSourceCredentials(): Promise<ParsedIniData> {
        const loadedCreds: ParsedIniData = {}

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE)) {
            const source = new SharedCredentialsProvider(this.profile[SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE]!, this.allSharedCredentialProfiles)
            const creds = await source.getCredentials()
            loadedCreds[this.profile[SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE]!] = {
                [SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID]: creds.accessKeyId,
                [SHARED_CREDENTIAL_PROPERTIES.AWS_SECRET_ACCESS_KEY]: creds.secretAccessKey,
                [SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN]: creds.sessionToken,
            }
            loadedCreds[this.profileName] = {
                [SHARED_CREDENTIAL_PROPERTIES.MFA_SERIAL]: source.profile[SHARED_CREDENTIAL_PROPERTIES.MFA_SERIAL],
            }
        }

        loadedCreds[this.profileName] = {
            ...loadedCreds[this.profileName],
            ...this.profile,
        }

        return loadedCreds
    }

    public async getCredentials(): Promise<AWS.Credentials> {
        // TODO: determine if the below comment still holds true (SDK v3 does not have global configuration for clients)
        // Profiles with references involving non-aws partitions need help getting the right STS endpoint
        // when resolving SharedIniFileCredentials. We set the global sts configuration with a suitable region
        // only to perform the resolve, then reset it.
        // This hack can be removed when https://github.com/aws/aws-sdk-js/issues/3088 is addressed.

        const validationMessage = this.validate()
        if (validationMessage) {
            throw new Error(`Profile ${this.profileName} is not a valid Credential Profile: ${validationMessage}`)
        }

        const loadedCreds: ParsedIniData = await this.patchSourceCredentials()

        //  SSO entry point
        if (this.isSsoProfile()) {
            const ssoCredentialProvider = this.makeSsoProvider()
            return await ssoCredentialProvider.refreshCredentials()
        }

        const provider = chain(this.makeCredentialsProvider(loadedCreds))
        return await resolveProviderWithCancel(this.profileName, provider())
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

    private makeCredentialsProvider(loadedCreds: ParsedIniData): AWS.CredentialProvider {
        const logger = getLogger()

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider(loadedCreds)
        }

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS} - treating as Process Credentials`
            )

            return fromProcess({ profile: this.profileName })
        }

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider(loadedCreds)
        }

        if (hasProfileProperty(this.profile, SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider(loadedCreds)
        }

        logger.error(`Profile ${this.profileName} did not contain any supported properties`)
        throw new Error(`Shared Credentials profile ${this.profileName} is not supported`)
    }

    private makeSharedIniFileCredentialsProvider(loadedCreds: ParsedIniData): AWS.CredentialProvider {
        const assumeRole = async (credentials: AWS.Credentials, params: AssumeRoleParams) => {
            const region = this.getDefaultRegion() ?? 'us-east-1'
            const stsClient = ext.toolkitClientBuilder.createStsClient(region, { credentials })
            const response = await stsClient.assumeRole(params)
            return { 
                accessKeyId: response.Credentials!.AccessKeyId!,
                secretAccessKey: response.Credentials!.SecretAccessKey!,
                sessionToken: response.Credentials?.SessionToken,
                expiration: response.Credentials?.Expiration
            }
        }

        return fromIni({
            profile: this.profileName,
            mfaCodeProvider: async mfaSerial =>
                await getMfaTokenFromUser(mfaSerial, this.profileName),
            roleAssumer: assumeRole,
            loadedConfig: Promise.resolve(
                {
                    credentialsFile: loadedCreds,
                    configFile: {},
                } as SharedConfigFiles
            )
        })
    }

    private makeSsoProvider() {
        // These properties are validated before reaching this method
        const ssoRegion = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_REGION]!
        const ssoUrl = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_START_URL]!

        const ssoOidcClient = new SSOOIDC({ region: ssoRegion })
        const cache = new DiskCache()
        const ssoAccessTokenProvider = new SsoAccessTokenProvider(ssoRegion, ssoUrl, ssoOidcClient, cache)

        const ssoClient = new SSO({ region: ssoRegion })
        const ssoAccount = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_ACCOUNT_ID]!
        const ssoRole = this.profile[SHARED_CREDENTIAL_PROPERTIES.SSO_ROLE_NAME]!
        return new SsoCredentialProvider(ssoAccount, ssoRole, ssoClient, ssoAccessTokenProvider)
    }

    /**
     * Legacy function that does nothing particularly useful.
     *
     * You are probably looking for `getCredentialsType2()`.
     *
     * TODO: deprecated / why is this static?!
     */
    public static getCredentialsType(): string {
        return SharedCredentialsProvider.CREDENTIALS_TYPE
    }

    public getCredentialsType2(): CredentialType {
        return this.isSsoProfile() ? 'ssoProfile' : 'staticProfile'
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
