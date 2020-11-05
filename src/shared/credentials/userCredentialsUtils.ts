/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as handlebars from 'handlebars'
import * as path from 'path'

import { mkdirp, writeFile } from 'fs-extra'
import { getConfigFilename, getCredentialsFilename } from '../../credentials/sharedCredentials'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'

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
        const candidateFiles: string[] = [getCredentialsFilename(), getConfigFilename()]

        const existsResults: boolean[] = await Promise.all(
            candidateFiles.map(async filename => await SystemUtilities.fileExists(filename))
        )

        return candidateFiles.filter((filename, index) => existsResults[index])
    }

    /**
     * @description Determines if credentials directory exists
     * If it doesn't, creates credentials directory
     * at directory from getCredentialsFilename()
     */
    public static async generateCredentialDirectoryIfNonexistent(): Promise<void> {
        const filepath = path.dirname(getCredentialsFilename())
        if (!(await fileExists(filepath))) {
            await mkdirp(filepath)
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
        if (await SystemUtilities.fileExists(getCredentialsFilename())) {
            throw new Error('Credentials file exists. Not overwriting it.')
        }

        await writeFile(getCredentialsFilename(), credentialsFileContents, {
            encoding: 'utf8',
            mode: 0o100600, // basic file (type 100) with 600 permissions
        })
    }
}
