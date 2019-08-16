/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as handlebars from 'handlebars'
import * as path from 'path'

import { Credentials } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { AwsContext } from '../awsContext'
import { StsClient } from '../clients/stsClient'
import { credentialHelpUrl } from '../constants'
import { EnvironmentVariables } from '../environmentVariables'
import { ext } from '../extensionGlobals'
import { mkdir, writeFile } from '../filesystem'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { getLogger, Logger } from '../logger'
import { SystemUtilities } from '../systemUtilities'

const localize = nls.loadMessageBundle()

/**
 * The payload used to fill in the handlebars template
 * for the simple credentials file.
 */
export interface CredentialsTemplateContext {
    profileName: string
    accessKey: string
    secretKey: string
}

export interface CredentialsValidationResult {
    isValid: boolean
    account?: string
    invalidMessage?: string
}

export class UserCredentialsUtils {
    /**
     * @description Determines which credentials related files
     * exist, and returns their filenames.
     *
     * @returns array of filenames for files found.
     */
    public static async findExistingCredentialsFilenames(): Promise<string[]> {
        const candidateFiles: string[] = [this.getCredentialsFilename(), this.getConfigFilename()]

        const existsResults: boolean[] = await Promise.all(
            candidateFiles.map(async filename => await SystemUtilities.fileExists(filename))
        )

        return candidateFiles.filter((filename, index) => existsResults[index])
    }

    /**
     * @returns Filename for the credentials file
     */
    public static getCredentialsFilename(): string {
        const env = process.env as EnvironmentVariables

        return env.AWS_SHARED_CREDENTIALS_FILE || path.join(SystemUtilities.getHomeDirectory(), '.aws', 'credentials')
    }

    /**
     * @returns Filename for the config file
     */
    public static getConfigFilename(): string {
        const env = process.env as EnvironmentVariables

        return env.AWS_CONFIG_FILE || path.join(SystemUtilities.getHomeDirectory(), '.aws', 'config')
    }

    /**
     * @description Determines if credentials directory exists
     * If it doesn't, creates credentials directory
     * at directory from this.getCredentialsFilename()
     */
    public static async generateCredentialDirectoryIfNonexistent(): Promise<void> {
        const filepath = path.dirname(this.getCredentialsFilename())
        if (!(await fileExists(filepath))) {
            await mkdir(filepath, { recursive: true })
        }
    }

    /**
     * @description Produces a credentials file from a template
     * containing a single profile based on the given information
     *
     * @param credentialsContext the profile to create in the file
     */
    public static async generateCredentialsFile(
        extensionPath: string,
        credentialsContext: CredentialsTemplateContext
    ): Promise<void> {
        const templatePath: string = path.join(extensionPath, 'resources', 'newUserCredentialsFile')

        const credentialsTemplate: string = await readFileAsString(templatePath)

        const handlebarTemplate = handlebars.compile(credentialsTemplate)
        const credentialsFileContents = handlebarTemplate(credentialsContext)

        // Make a final check
        if (await SystemUtilities.fileExists(this.getCredentialsFilename())) {
            throw new Error('Credentials file exists. Not overwriting it.')
        }

        await writeFile(this.getCredentialsFilename(), credentialsFileContents, {
            encoding: 'utf8',
            mode: 0o100600 // basic file (type 100) with 600 permissions
        })
    }

    /**
     * @description Tests if the given credentials are valid by making a request to AWS
     *
     * @param accessKey access key of credentials to validate
     * @param secretKey secret key of credentials to validate
     * @param sts (Optional) STS Service Client
     *
     * @returns a validation result, indicating whether or not credentials are valid
     *      if valid: result includes active account
     *      if invalid: result includes message with reason
     */
    public static async validateCredentials(
        credentials: Credentials,
        sts?: StsClient
    ): Promise<CredentialsValidationResult> {
        const logger: Logger = getLogger()

        if (!sts) {
            const transformedCredentials: ServiceConfigurationOptions = {
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken
                }
            }
            try {
                // Past iteration did not include a set region. Should we change this?
                // We can also use the set region if/when we migrate to a single-region experience:
                // https://github.com/aws/aws-toolkit-vscode/issues/549
                sts = ext.toolkitClientBuilder.createStsClient('us-east-1', transformedCredentials)
            } catch (err) {
                const error = err as Error
                logger.error(error)
                throw error
            }
        }

        try {
            const response = await sts.getCallerIdentity()

            return { isValid: !!response.Account, account: response.Account }
        } catch (err) {
            let reason: string
            if (err instanceof Error) {
                const error = err as Error
                reason = error.message
                logger.error(error)
            } else {
                reason = err as string
            }

            return { isValid: false, invalidMessage: reason }
        }
    }

    /**
     * Adds valid profiles to the AWS context and settings.
     *
     * @param profileName Profile name to add to AWS Context/AWS settings
     * @param awsContext Current AWS Context
     * @param sts (Optional) STS Service Client
     *
     * @returns true if the profile was valid and added to the context
     *          false if the profile was not valid and thus not added.
     */
    public static async addUserDataToContext(
        profileName: string,
        awsContext: AwsContext,
        sts?: StsClient
    ): Promise<boolean> {
        let credentials: Credentials | undefined
        try {
            credentials = await awsContext.getCredentials(profileName)
            const account = credentials ? await this.validateCredentials(credentials, sts) : undefined
            if (account && account.isValid) {
                await awsContext.setCredentialProfileName(profileName)
                await awsContext.setCredentialAccountId(account.account)

                return true
            }
        } catch (err) {
            // swallow any errors--anything that isn't a success should be handled as a failure by the caller
        }

        return false
    }

    /**
     * Removes user's profile and account from AWS context
     *
     * @param awsContext Current AWS Context
     */
    public static async removeUserDataFromContext(awsContext: AwsContext) {
        await awsContext.setCredentialProfileName()
        await awsContext.setCredentialAccountId()
    }

    public static async notifyUserCredentialsAreBad(profileName: string) {
        const getHelp = localize('AWS.message.credentials.invalidProfile.help', 'Get Help...')
        const selection = await vscode.window.showErrorMessage(
            localize('AWS.message.credentials.invalidProfile', 'Credentials profile {0} is invalid', profileName),
            getHelp
        )

        if (selection === getHelp) {
            vscode.env.openExternal(vscode.Uri.parse(credentialHelpUrl))
        }
    }
}
