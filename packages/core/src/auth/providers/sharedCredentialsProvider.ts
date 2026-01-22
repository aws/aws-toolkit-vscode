/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'
import { fromLoginCredentials } from '@aws-sdk/credential-providers'
import { fromProcess } from '@aws-sdk/credential-provider-process'
import { ParsedIniData } from '@smithy/types'
import { chain } from '@aws-sdk/property-provider'
import { fromInstanceMetadata, fromContainerMetadata } from '@smithy/credential-provider-imds'
import { fromEnv } from '@aws-sdk/credential-provider-env'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger/logger'
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
import { CredentialsData, SectionName, SharedCredentialsKeys } from '../credentials/types'
import { SsoProfile, hasScopes, scopesSsoAccountAccess } from '../connection'
import { builderIdStartUrl } from '../sso/constants'
import { ToolkitError } from '../../shared/errors'

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

export async function handleInvalidConsoleCredentials(
    error: Error,
    profileName: string,
    region: string
): Promise<never> {
    getLogger().error('Console login authentication failed for profile %s in region %s: %O', profileName, region, error)

    // Indicates that a VS Code window reload is required to reinitialize credential providers
    // and avoid using stale console session credentials when login cache and in-memory state diverge.
    let requiresVscodeReloadForCredentials = false
    if (
        error.message.includes('Your session has expired') ||
        error.message.includes('Failed to load a token for session') ||
        error.message.includes('Failed to load token from')
    ) {
        requiresVscodeReloadForCredentials = true
        // Ask for user confirmation before refreshing
        const response = await vscode.window.showInformationMessage(
            `Unable to use your console credentials for profile "${profileName}". Would you like to retry?`,
            localizedText.retry,
            localizedText.cancel
        )

        if (response !== localizedText.retry) {
            throw ToolkitError.chain(error, 'User cancelled console credentials token refresh.', {
                code: 'LoginSessionRefreshCancelled',
                cancelled: true,
            })
        }

        getLogger().info('Re-authenticating using console credentials for profile %s', profileName)
        // Execute the console login command with the existing profile and region
        try {
            await vscode.commands.executeCommand('aws.toolkit.auth.consoleLogin', profileName, region)
        } catch (_) {
            void vscode.window.showErrorMessage(
                `Unable to refresh your AWS credentials. Please run 'aws login --profile ${profileName}' in your terminal, then reload VS Code to continue.`
            )
        }
    }

    if (error.message.includes('does not contain login_session')) {
        // The credential provider was created before the CLI wrote the new login session to disk.
        // This happens when you run console login and immediately try to use the connection.
        // A window reload is needed to pick up the newly created session.
        requiresVscodeReloadForCredentials = true
    }

    if (requiresVscodeReloadForCredentials) {
        getLogger().info(
            `Reloading window to sync with updated credentials cache using connection for profile: ${profileName}`
        )
        const reloadResponse = await vscode.window.showInformationMessage(
            `Credentials for "${profileName}" were updated. A window reload is required to apply them. Save your work before continuing. Reload now?`,
            localizedText.yes,
            localizedText.no
        )
        if (reloadResponse === localizedText.yes) {
            // At this point, the console credential cache on disk has been updated (via AWS CLI login),
            // but the in-memory credential providers used by the Toolkit / AWS SDK were already
            // constructed earlier and continue to reference stale credentials.
            //
            // Notes on behavior:
            // - Console credentials are read once when the provider is created and are not reloaded
            //   dynamically at runtime.
            // - Removing or recreating connections/profiles does not rebuild the underlying provider.
            // - Filesystem watchers may detect cache changes, but provider instances still hold
            //   the originally loaded credentials.
            // - Attempting to swap providers at runtime can introduce incompatibilities between
            //   legacy credential shims and AWS SDK v3 providers.
            //
            // Authentication flow (simplified):
            //   aws login (CLI) -> writes ~/.aws/login/cache
            //   Toolkit -> constructs credential provider (snapshots credentials in memory)
            //   SDK calls -> continue using in-memory credentials until provider is reinitialized
            //
            // A VS Code window reload is the only safe and deterministic way to fully reinitialize
            // credential providers and ensure the updated console session credentials are used.
            await vscode.commands.executeCommand('workbench.action.reloadWindow')
        }
        throw ToolkitError.chain(error, 'Console credentials require window reload', {
            code: 'FromLoginCredentialProviderError',
        })
    }

    throw ToolkitError.chain(error, 'Console credentials error', {
        code: 'FromLoginCredentialProviderError',
    })
}

/**
 * Represents one profile from the AWS Shared Credentials files.
 */
export class SharedCredentialsProvider implements CredentialsProvider {
    private readonly section = getSectionOrThrow(this.sections, this.profileName, 'profile')
    private readonly profile = extractDataFromSection(this.section)

    public constructor(
        private readonly profileName: string,
        private readonly sections: Section[]
    ) {}

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
        } else if (hasProps(this.profile, SharedCredentialsKeys.CONSOLE_SESSION)) {
            return 'consoleSessionProfile'
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

    public getEndpointUrl(): string | undefined {
        return this.profile[SharedCredentialsKeys.ENDPOINT_URL]?.trim()
    }

    public async canAutoConnect(): Promise<boolean> {
        if (isSsoProfile(this.profile)) {
            const tokenProvider = SsoAccessTokenProvider.create({
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
            scopes: scopes?.split(',').map((s) => s.trim()),
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
        } else if (hasProps(this.profile, SharedCredentialsKeys.CONSOLE_SESSION)) {
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
            if (!this.sections.some((s) => s.name === profileName && s.type === 'profile')) {
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

        if (hasProps(this.profile, SharedCredentialsKeys.CONSOLE_SESSION)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SharedCredentialsKeys.CONSOLE_SESSION} - treating as Console Credentials`
            )

            return this.makeConsoleSessionCredentialsProvider()
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
        const tokenProvider = SsoAccessTokenProvider.create({ ...ssoProfile, region })
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

    private makeConsoleSessionCredentialsProvider() {
        const defaultRegion = this.getDefaultRegion() ?? 'us-east-1'
        const baseProvider = fromLoginCredentials({
            profile: this.profileName,
            clientConfig: {
                // Console session profiles created by 'aws login' may not have a region property
                // The AWS CLI's philosophy is to treat global options like --region as per-invocation overrides
                // rather than persistent configuration, minimizing what gets permanently stored in profiles
                // and deferring configuration decisions until the actual command execution.
                region: defaultRegion,
            },
        })
        return async () => {
            try {
                return await baseProvider()
            } catch (error) {
                if (error instanceof Error) {
                    await handleInvalidConsoleCredentials(error, this.profileName, defaultRegion)
                }
                throw error
            }
        }
    }

    private makeSharedIniFileCredentialsProvider(loadedCreds?: ParsedIniData): AWS.CredentialProvider {
        // Our credentials logic merges profiles from the credentials and config files but SDK v3 does not
        // This can cause odd behavior where the Toolkit can switch to a profile but not authenticate with it
        // So the workaround is to do give the SDK the merged profiles directly
        const profileSections = this.sections.filter(isProfileSection)
        const profiles = toRecord(
            profileSections.map((s) => s.name),
            (k) => this.getProfile(k)
        )

        return async () => {
            const iniData = loadedCreds ?? profiles
            const profile: CredentialsData = iniData[this.profileName]
            if (!profile) {
                throw new ToolkitError(`auth: Profile ${this.profileName} not found`)
            }
            // No role to assume, return static credentials.
            if (!profile.role_arn) {
                return {
                    accessKeyId: profile.aws_access_key_id!,
                    secretAccessKey: profile.aws_secret_access_key!,
                    sessionToken: profile.aws_session_token,
                }
            }
            if (!profile.source_profile || !iniData[profile.source_profile]) {
                throw new ToolkitError(
                    `auth: Profile ${this.profileName} is missing source_profile for role assumption`
                )
            }

            // Check if we already have resolved credentials from patchSourceCredentials
            const sourceProfile = iniData[profile.source_profile!]
            let sourceCredentials: AWS.Credentials

            if (sourceProfile.aws_access_key_id && sourceProfile.aws_secret_access_key) {
                // Source credentials have already been resolved
                sourceCredentials = {
                    accessKeyId: sourceProfile.aws_access_key_id,
                    secretAccessKey: sourceProfile.aws_secret_access_key,
                    sessionToken: sourceProfile.aws_session_token,
                }
            } else {
                // Source profile needs credential resolution - this should have been handled by patchSourceCredentials
                // but if not, we need to resolve it here
                const sourceProvider = new SharedCredentialsProvider(profile.source_profile!, this.sections)
                sourceCredentials = await sourceProvider.getCredentials()
            }

            // Use source credentials to assume IAM role based on role ARN provided.
            const stsClient = new DefaultStsClient(this.getDefaultRegion() ?? 'us-east-1', sourceCredentials)

            // Prompt for MFA Token if needed.
            const assumeRoleReq = {
                RoleArn: profile.role_arn,
                RoleSessionName: 'AssumeRoleSession',
                ...(profile.mfa_serial
                    ? {
                          SerialNumber: profile.mfa_serial,
                          TokenCode: await getMfaTokenFromUser(profile.mfa_serial, this.profileName),
                      }
                    : {}),
            }
            const assumeRoleRsp = await stsClient.assumeRole(assumeRoleReq)
            return {
                accessKeyId: assumeRoleRsp.Credentials!.AccessKeyId!,
                secretAccessKey: assumeRoleRsp.Credentials!.SecretAccessKey!,
                sessionToken: assumeRoleRsp.Credentials?.SessionToken,
                expiration: assumeRoleRsp.Credentials?.Expiration,
            }
        }
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
