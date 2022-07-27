/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'

import { mkdirp, writeFile } from 'fs-extra'
import { getConfigFilename, getCredentialsFilename } from '../../credentials/sharedCredentials'
import { fileExists } from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'

const header = `
# Amazon Web Services Credentials File used by AWS CLI, SDKs, and tools
# This file was created by the AWS Toolkit for Visual Studio Code extension.
#
# Your AWS credentials are represented by access keys associated with IAM users.
# For information about how to create and manage AWS access keys for a user, see:
# https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
#
# This credential file can store multiple access keys by placing each one in a
# named "profile". For information about how to change the access keys in a 
# profile or to add a new profile with a different access key, see:
# https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html 
`.trim()

const createNewCredentialsFile = (ctx: CredentialsTemplateContext) =>
    `
[${ctx.profileName}]
# The access key and secret key pair identify your account and grant access to AWS.
aws_access_key_id = ${ctx.accessKey}
# Treat your secret key like a password. Never share your secret key with anyone. Do 
# not post it in online forums, or store it in a source control system. If your secret 
# key is ever disclosed, immediately use IAM to delete the access key and secret key
# and create a new key pair. Then, update this file with the replacement key details.
aws_secret_access_key = ${ctx.secretKey}
`.trim()

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

/**
 * @deprecated
 */
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
     * @param credentialsContext the profile to create in the file
     */
    public static async generateCredentialsFile(credentialsContext?: CredentialsTemplateContext): Promise<void> {
        await this.generateCredentialDirectoryIfNonexistent()
        const dest = getCredentialsFilename()
        const contents = credentialsContext ? ['', createNewCredentialsFile(credentialsContext)] : []

        if (await SystemUtilities.fileExists(dest)) {
            contents.unshift(await SystemUtilities.readFile(dest))
        } else {
            contents.unshift(header)
        }

        await writeFile(dest, contents.join('\n'), {
            encoding: 'utf8',
            mode: 0o100600, // basic file (type 100) with 600 permissions
        })
    }
}
