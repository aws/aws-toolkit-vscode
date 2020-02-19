/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { Profile } from '../../shared/credentials/credentialsFile'
import { getLogger } from '../../shared/logger'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { getMfaTokenFromUser } from '../credentialsCreator'
import { CredentialsProvider } from './credentialsProvider'
import { CredentialsProviderId } from './credentialsProviderId'

const SHARED_CREDENTIAL_PROPERTIES = {
    AWS_ACCESS_KEY_ID: 'aws_access_key_id',
    AWS_SECRET_ACCESS_KEY: 'aws_secret_access_key',
    AWS_SESSION_TOKEN: 'aws_session_token',
    CREDENTIAL_PROCESS: 'credential_process',
    REGION: 'region',
    ROLE_ARN: 'role_arn',
    SOURCE_PROFILE: 'source_profile'
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
            credentialTypeId: this.profileName
        }
    }

    public getHashCode(): string {
        return getStringHash(JSON.stringify(this.profile))
    }

    public getDefaultRegion(): string | undefined {
        return this.profile[SHARED_CREDENTIAL_PROPERTIES.REGION]
    }

    /**
     * Returns undefined if the Profile is valid, else a string indicating what is invalid
     */
    public validate(): string | undefined {
        const expectedProperties: string[] = []

        if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN)) {
            return this.validateSourceProfileChain()
        } else if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS)) {
            // No validation. Don't check anything else.
            return undefined
        } else if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN)) {
            expectedProperties.push(
                SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID,
                SHARED_CREDENTIAL_PROPERTIES.AWS_SECRET_ACCESS_KEY
            )
        } else if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID)) {
            expectedProperties.push(SHARED_CREDENTIAL_PROPERTIES.AWS_SECRET_ACCESS_KEY)
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
        const validationMessage = this.validate()
        if (validationMessage) {
            throw new Error(`Profile ${this.profileName} is not a valid Credential Profile: ${validationMessage}`)
        }

        const provider = new AWS.CredentialProviderChain([this.makeCredentialsProvider()])

        return provider.resolvePromise()
    }

    private hasProfileProperty(propertyName: string): boolean {
        return !!this.profile[propertyName]
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

        while (!!profile[SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE]) {
            const profileName = profile[SHARED_CREDENTIAL_PROPERTIES.SOURCE_PROFILE]!

            // Cycle
            if (profilesTraversed.indexOf(profileName) !== -1) {
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

        if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.ROLE_ARN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider()
        }

        if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.CREDENTIAL_PROCESS} - treating as Process Credentials`
            )

            return () => new AWS.ProcessCredentials({ profile: this.profileName })
        }

        if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN)) {
            logger.verbose(
                `Profile ${this.profileName} contains ${SHARED_CREDENTIAL_PROPERTIES.AWS_SESSION_TOKEN} - treating as regular Shared Credentials`
            )

            return this.makeSharedIniFileCredentialsProvider()
        }

        if (this.hasProfileProperty(SHARED_CREDENTIAL_PROPERTIES.AWS_ACCESS_KEY_ID)) {
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
                    await getMfaTokenFromUser(mfaSerial, this.profileName, callback)
            })
    }
    public static getCredentialsType(): string {
        return SharedCredentialsProvider.CREDENTIALS_TYPE
    }
}
