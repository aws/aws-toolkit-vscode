/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from '@aws-sdk/types'
import { AssumeRoleParams, fromIni } from '@aws-sdk/credential-provider-ini'
import { fromProcess } from '@aws-sdk/credential-provider-process'
import { ParsedIniData, SharedConfigFiles } from '@smithy/shared-ini-file-loader'
import { chain } from '@aws-sdk/property-provider'
import { fromInstanceMetadata, fromContainerMetadata } from '@aws-sdk/credential-provider-imds'
import { fromEnv } from '@aws-sdk/credential-provider-env'
import { getLogger } from '../../shared/logger'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { getMfaTokenFromUser, resolveProviderWithCancel } from '../credentials/utils'
import { CredentialsProvider, CredentialsProviderType, CredentialsId } from './credentials'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { assertHasProps, getMissingProps, hasProps } from '../../shared/utilities/tsUtils'
import { DefaultStsClient } from '../../shared/clients/stsClient'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import { SsoClient } from '../sso/clients'
import { toRecord } from '../../shared/utilities/collectionUtils'
import {
    extractDataFromSection,
    getRequiredFields,
    getSectionDataOrThrow,
    getSectionOrThrow,
    isProfileSection,
    Profile,
    Section,
} from '../credentials/sharedCredentials'
import { builderIdStartUrl } from '../sso/model'
import { SectionName, SharedCredentialsKeys } from '../credentials/types'
import { SsoProfile, hasScopes, scopesSsoAccountAccess } from '../connection'

const credentialSources = {
    ECS_CONTAINER: 'EcsContainer',
    EC2_INSTANCE_METADATA: 'Ec2InstanceMetadata',
    ENVIRONMENT: 'Environment',
}

function validateProfile(profile: Profile, ...props: string[]): string | undefined {
    const missing = getMissingProps(profile, ...props)

    if (missing.length !== 0) {
        return `missing properties: ${missing.join(', ')}`
    }
}

function isSsoProfile(profile: Profile): boolean {
    return (
        hasProps(profile, SharedCredentialsKeys.SSO_SESSION) ||
        hasProps(profile, SharedCredentialsKeys.SSO_START_URL) ||
        hasProps(profile, SharedCredentialsKeys.SSO_REGION) ||
        hasProps(profile, SharedCredentialsKeys.SSO_ROLE_NAME) ||
        hasProps(profile, SharedCredentialsKeys.SSO_ACCOUNT_ID)
    )
}

/**
 * Represents one profile from the AWS Shared Credentials files.
 */
export class SharedCredentialsProvider implements CredentialsProvider {
    private readonly section = getSectionOrThrow(this.sections, this.profileName, 'profile')
    private readonly profile = extractDataFromSection(this.section)

    public constructor(private readonly profileName: string, private readonly sections: Section[]) {}

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
        if (hasProps(this.profile, SharedCredentialsKeys.SSO_START_URL)) {
            return 'ssoProfile'
        } else if (this.isCredentialSource(credentialSources.EC2_INSTANCE_METADATA)) {
            return 'ec2Metadata'
        } else if (this.isCredentialSource(credentialSources.ECS_CONTAINER)) {
            return 'ecsMetatdata' // TODO: fix telemetry value typo
        } else if (this.isCredentialSource(credentialSources.ENVIRONMENT)) {
            return 'other'
        }
        return 'staticProfile'
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.profile))
    }

    public getDefaultRegion(): string | undefined {
        return this.profile[SharedCredentialsKeys.REGION]
    }

    public async canAutoConnect(): Promise<boolean> {
        if (isSsoProfile(this.profile)) {
            const tokenProvider = new SsoAccessTokenProvider({
                region: this.profile[SharedCredentialsKeys.SSO_REGION]!,
                startUrl: this.profile[SharedCredentialsKeys.SSO_START_URL]!,
            })

            return (await tokenProvider.getToken()) !== undefined
        }

        return !hasProps(this.profile, SharedCredentialsKeys.MFA_SERIAL)
    }

    public async isAvailable(): Promise<boolean> {
        const validationMessage = this.validate()
        if (validationMessage) {
            getLogger().error(`Profile ${this.profileName} is not a valid Credential Profile: ${validationMessage}`)
            return false
        }

        // XXX: hide builder ID profiles until account linking is supported
        try {
            const ssoProfile = this.getSsoProfileFromProfile()
            if (ssoProfile.startUrl === builderIdStartUrl) {
                getLogger().verbose(
                    `Profile ${this.profileName} uses Builder ID which is not supported for sigv4 auth.`
                )
                return false
            }
        } catch {
            // Swallow error. Continue as-if it were valid.
        }

        return true
    }

    private getProfile(name: SectionName) {
        return getSectionDataOrThrow(this.sections, name, 'profile')
    }

    private getSsoProfileFromProfile(): SsoProfile & { identifier?: string } {
        const defaultRegion = this.getDefaultRegion() ?? 'us-east-1'
        const sessionName = this.profile[SharedCredentialsKeys.SSO_SESSION]
        if (sessionName === undefined) {
            assertHasProps(this.profile, SharedCredentialsKeys.SSO_START_URL)

            return {
                type: 'sso',
                scopes: scopesSsoAccountAccess,
                startUrl: this.profile[SharedCredentialsKeys.SSO_START_URL],
                ssoRegion: this.profile[SharedCredentialsKeys.SSO_REGION] ?? defaultRegion,
            }
        }

        const sessionData = getSectionDataOrThrow(this.sections, sessionName, 'sso-session')
        const scopes = sessionData[SharedCredentialsKeys.SSO_REGISTRATION_SCOPES]
        assertHasProps(sessionData, SharedCredentialsKeys.SSO_START_URL)

        return {
            type: 'sso',
            identifier: sessionName,
            scopes: scopes?.split(',').map(s => s.trim()),
            startUrl: sessionData[SharedCredentialsKeys.SSO_START_URL],
            ssoRegion: sessionData[SharedCredentialsKeys.SSO_REGION] ?? defaultRegion,
        }
    }

    /**
     * Returns undefined if the Profile is valid, else a string indicating what is invalid
     */
    public validate(): string | undefined {
        if (hasProps(this.profile, SharedCredentialsKeys.CREDENTIAL_SOURCE)) {
            return this.validateSourcedCredentials()
        } else if (hasProps(this.profile, SharedCredentialsKeys.ROLE_ARN)) {
            return this.validateSourceProfileChain()
        } else if (hasProps(this.profile, SharedCredentialsKeys.CREDENTIAL_PROCESS)) {
            // No validation. Don't check anything else.
            return undefined
        } else if (
            hasProps(this.profile, SharedCredentialsKeys.AWS_ACCESS_KEY_ID) ||
            hasProps(this.profile, SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY) ||
            hasProps(this.profile, SharedCredentialsKeys.AWS_SESSION_TOKEN)
        ) {
            return validateProfile(
                this.profile,
                SharedCredentialsKeys.AWS_ACCESS_KEY_ID,
                SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY
            )
        } else if (isSsoProfile(this.profile)) {
            return undefined
        } else {
            return 'not supported by the Toolkit'
        }
    }

    /**
     * Patches 'source_profile' credentials as static representations, which the SDK can handle in all cases.
     *
     * XXX: Returns undefined if no `source_profile` property exists. Else we would prevent the SDK from re-reading
     * the shared credential files if they were to change. #1953
     *
     * The SDK is unable to resolve `source_profile` fields when the source profile uses SSO/MFA/credential_process.
     * We can handle this resolution ourselves, giving the SDK the resolved credentials by 'pre-loading' them.
     */
    private async patchSourceCredentials(): Promise<ParsedIniData | undefined> {
        if (!hasProps(this.profile, SharedCredentialsKeys.SOURCE_PROFILE)) {
            return undefined
        }

        const loadedCreds: ParsedIniData = {}

        const source = new SharedCredentialsProvider(this.profile[SharedCredentialsKeys.SOURCE_PROFILE]!, this.sections)
        const creds = await source.getCredentials()
        loadedCreds[this.profile[SharedCredentialsKeys.SOURCE_PROFILE]!] = {
            [SharedCredentialsKeys.AWS_ACCESS_KEY_ID]: creds.accessKeyId,
            [SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]: creds.secretAccessKey,
            [SharedCredentialsKeys.AWS_SESSION_TOKEN]: creds.sessionToken,
        }
        loadedCreds[this.profileName] = {
            [SharedCredentialsKeys.MFA_SERIAL]: source.profile[SharedCredentialsKeys.MFA_SERIAL],
        }

        loadedCreds[this.profileName] = {
            ...loadedCreds[this.profileName],
            ...this.profile,
        }

        return loadedCreds
    }

    public async getCredentials(): Promise<AWS.Credentials> {
        const validationMessage = this.validate()
        if (validationMessage) {
            throw new Error(`Profile ${this.profileName} is not a valid Credential Profile: ${validationMessage}`)
        }

        const loadedCreds = await this.patchSourceCredentials()

        const provider = chain(this.makeCredentialsProvider(loadedCreds))

        // SSO profiles already show a notification, no need to show another
        if (isSsoProfile(this.profile)) {
            return provider()
        } else {
            return resolveProviderWithCancel(this.profileName, provider())
        }
    }

    /**
     * Returns undefined if the Profile Chain is valid, else a string indicating what is invalid
     */
    private validateSourceProfileChain(): string | undefined {
        const profilesTraversed: string[] = [this.profileName]

        let profile = this.profile

        while (profile[SharedCredentialsKeys.SOURCE_PROFILE]) {
            const profileName = profile[SharedCredentialsKeys.SOURCE_PROFILE]!

            // Cycle
            if (profilesTraversed.includes(profileName)) {
                profilesTraversed.push(profileName)

                return `Cycle detected within Shared Credentials Profiles. Reference chain: ${profilesTraversed.join(
                    ' -> '
                )}`
            }

            profilesTraversed.push(profileName)

            // Missing reference
            if (!this.sections.some(s => s.name === profileName && s.type === 'profile')) {
                return `Shared Credentials Profile ${profileName} not found. Reference chain: ${profilesTraversed.join(
                    ' -> '
                )}`
            }

            profile = this.getProfile(profileName)
        }
    }

    private validateSourcedCredentials(): string | undefined {
        if (hasProps(this.profile, SharedCredentialsKeys.SOURCE_PROFILE)) {
            return `credential_source and source_profile cannot both be set`
        }

        const source = this.profile[SharedCredentialsKeys.CREDENTIAL_SOURCE]!
        if (!Object.values(credentialSources).includes(source)) {
            return `Credential source ${this.profile[SharedCredentialsKeys.CREDENTIAL_SOURCE]} is not supported`
        }
    }

    private makeCredentialsProvider(loadedCreds?: ParsedIniData): AWS.CredentialProvider {
        const logger = getLogger()

        if (hasProps(this.profile, SharedCredentialsKeys.CREDENTIAL_SOURCE)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SharedCredentialsKeys.CREDENTIAL_SOURCE} - treating as Environment Credentials`
            )
            return this.makeSourcedCredentialsProvider()
        }

        if (hasProps(this.profile, SharedCredentialsKeys.ROLE_ARN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SharedCredentialsKeys.ROLE_ARN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider(loadedCreds)
        }

        if (hasProps(this.profile, SharedCredentialsKeys.CREDENTIAL_PROCESS)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SharedCredentialsKeys.CREDENTIAL_PROCESS} - treating as Process Credentials`
            )

            return fromProcess({ profile: this.profileName })
        }

        if (hasProps(this.profile, SharedCredentialsKeys.AWS_SESSION_TOKEN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SharedCredentialsKeys.AWS_SESSION_TOKEN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider(loadedCreds)
        }

        if (hasProps(this.profile, SharedCredentialsKeys.AWS_ACCESS_KEY_ID)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SharedCredentialsKeys.AWS_ACCESS_KEY_ID} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider(loadedCreds)
        }

        if (isSsoProfile(this.profile)) {
            logger.verbose(`Profile ${this.profileName} is an SSO profile - treating as SSO Credentials`)

            return this.makeSsoCredentaislProvider()
        }

        logger.error(`Profile ${this.profileName} did not contain any supported properties`)
        throw new Error(`Shared Credentials profile ${this.profileName} is not supported`)
    }

    private makeSsoCredentaislProvider() {
        const ssoProfile = this.getSsoProfileFromProfile()
        if (!hasScopes(ssoProfile, scopesSsoAccountAccess)) {
            throw new Error(`Session for "${this.profileName}" is missing required scope: sso:account:access`)
        }

        const region = ssoProfile.ssoRegion
        const tokenProvider = new SsoAccessTokenProvider({ ...ssoProfile, region })
        const client = SsoClient.create(region, tokenProvider)

        return async () => {
            if ((await tokenProvider.getToken()) === undefined) {
                await tokenProvider.createToken()
            }

            const data = getRequiredFields(
                this.section,
                SharedCredentialsKeys.SSO_ACCOUNT_ID,
                SharedCredentialsKeys.SSO_ROLE_NAME
            )

            return client.getRoleCredentials({
                accountId: data[SharedCredentialsKeys.SSO_ACCOUNT_ID],
                roleName: data[SharedCredentialsKeys.SSO_ROLE_NAME],
            })
        }
    }

    private makeSharedIniFileCredentialsProvider(loadedCreds?: ParsedIniData): AWS.CredentialProvider {
        const assumeRole = async (credentials: AWS.Credentials, params: AssumeRoleParams) => {
            const region = this.getDefaultRegion() ?? 'us-east-1'
            const stsClient = new DefaultStsClient(region, credentials)
            const response = await stsClient.assumeRole(params)
            return {
                accessKeyId: response.Credentials!.AccessKeyId!,
                secretAccessKey: response.Credentials!.SecretAccessKey!,
                sessionToken: response.Credentials?.SessionToken,
                expiration: response.Credentials?.Expiration,
            }
        }

        // Our credentials logic merges profiles from the credentials and config files but SDK v3 does not
        // This can cause odd behavior where the Toolkit can switch to a profile but not authenticate with it
        // So the workaround is to do give the SDK the merged profiles directly
        const profileSections = this.sections.filter(isProfileSection)
        const profiles = toRecord(
            profileSections.map(s => s.name),
            k => this.getProfile(k)
        )

        return fromIni({
            profile: this.profileName,
            mfaCodeProvider: async mfaSerial => await getMfaTokenFromUser(mfaSerial, this.profileName),
            roleAssumer: assumeRole,
            loadedConfig: Promise.resolve({
                credentialsFile: loadedCreds ?? profiles,
                configFile: {},
            } as SharedConfigFiles),
        })
    }

    private makeSourcedCredentialsProvider(): AWS.CredentialProvider {
        if (this.isCredentialSource(credentialSources.EC2_INSTANCE_METADATA)) {
            return fromInstanceMetadata()
        } else if (this.isCredentialSource(credentialSources.ECS_CONTAINER)) {
            return fromContainerMetadata()
        } else if (this.isCredentialSource(credentialSources.ENVIRONMENT)) {
            return fromEnv()
        }
        throw new Error(`Credential source ${this.profile[SharedCredentialsKeys.CREDENTIAL_SOURCE]} is not supported`)
    }

    private isCredentialSource(source: string): boolean {
        if (hasProps(this.profile, SharedCredentialsKeys.CREDENTIAL_SOURCE)) {
            return this.profile[SharedCredentialsKeys.CREDENTIAL_SOURCE] === source
        }
        return false
    }
}
