/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as handlebars from 'handlebars'
import * as path from 'path'

import { writeFile } from 'fs-extra'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { credentialHelpUrl } from '../constants'
import { EnvironmentVariables } from '../environmentVariables'
import { mkdir } from '../filesystem'
import { fileExists, readFileAsString } from '../filesystemUtilities'
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
