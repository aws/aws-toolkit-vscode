/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as handlebars from 'handlebars'
import * as path from 'path'

import { STS } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { EnvironmentVariables } from '../environmentVariables'
import { writeFileAsync } from '../filesystem'
import { readFileAsString } from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'

const env = process.env as EnvironmentVariables
export const defaultCredentialsFile = path.join(SystemUtilities.getHomeDirectory(), '.aws', 'credentials')
export const defaultConfigFile = path.join(SystemUtilities.getHomeDirectory(), '.aws', 'config')
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
    isValid: boolean,
    invalidMessage?: string
}

export class UserCredentialsUtils {
    public credentialsFile?: string
    public configFile?: string
    private readonly credentialsFileTemplate: string
    public constructor({credentialsFile, configFile, credentialsFileTemplate}: {
        credentialsFile?: string,
        configFile?: string
        credentialsFileTemplate?: string
    } = {}) {
        this.credentialsFile = credentialsFile

        this.configFile = configFile

        this.credentialsFileTemplate = credentialsFileTemplate ||
            path.join(__dirname, '..', '..', '..', '..', 'resources', 'newUserCredentialsFile')
    }

    /**
     * @description Determines which credentials related files
     * exist, and returns their filenames.
     *
     * @returns array of filenames for files found.
     */
    public async findExistingCredentialsFilenames(): Promise<string[]> {
        const candidateFiles: string[] = [
            this.getCredentialsFilename(),
            this.getConfigFilename()
        ]

        const existsResults: boolean[] = await Promise.all(
            candidateFiles.map(async filename => await SystemUtilities.fileExists(filename))
        )

        return candidateFiles.filter((filename, index) => existsResults[index])
    }

    /**
     * @returns File path for the credentials file
     */
    public getCredentialsFilename(): string {
        return this.credentialsFile || env.AWS_SHARED_CREDENTIALS_FILE || defaultCredentialsFile
    }

    /**
     * @returns File path for the config file
     */
    public getConfigFilename(): string {
        return this.configFile || env.AWS_CONFIG_FILE || defaultConfigFile
    }

    /**
     * @description Produces a credentials file from a template
     * containing a single profile based on the given information
     *
     * @param credentialsContext the profile to create in the file
     */
    public async generateCredentialsFile(credentialsContext: CredentialsTemplateContext): Promise<void> {

        const credentialsTemplate: string = await readFileAsString(this.credentialsFileTemplate, 'utf-8')

        const handlebarTemplate = handlebars.compile(credentialsTemplate)
        const credentialsFileContents = handlebarTemplate(credentialsContext)

        // Make a final check
        if (await SystemUtilities.fileExists(this.getCredentialsFilename())) {
            throw new Error('Credentials file exists. Not overwriting it.')
        }

        await writeFileAsync(this.getCredentialsFilename(), credentialsFileContents, {
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
     * @returns a validation result, indicating whether or not credentials are valid, and if not,
     * an error message.
     */
    public static async validateCredentials(
        accessKey: string,
        secretKey: string,
        sts?: STS
    ): Promise<CredentialsValidationResult> {
        try {
            if (!sts) {
                const awsServiceOpts: ServiceConfigurationOptions = {
                    accessKeyId: accessKey,
                    secretAccessKey: secretKey
                }

                sts = new STS(awsServiceOpts)
            }

            await sts.getCallerIdentity().promise()

            return { isValid: true }

        } catch (err) {

            let reason: string

            if (err instanceof Error) {
                const error = err as Error
                console.error(error.message)
                reason = error.message
            } else {
                reason = err as string
            }

            return { isValid: false, invalidMessage: reason }
        }
    }
}
