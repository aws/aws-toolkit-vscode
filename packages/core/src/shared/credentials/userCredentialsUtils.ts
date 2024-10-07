/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { fileExists } from '../filesystemUtilities'
import { isNonNullable } from '../utilities/tsUtils'
import { getConfigFilename, getCredentialsFilename } from '../../auth/credentials/sharedCredentialsFile'
import { fs } from '../../shared/fs/fs'

const header = `
# AWS credentials file used by AWS CLI, SDKs, and tools.
# Created by AWS Toolkit for VS Code. https://aws.amazon.com/visualstudiocode/
#
# Each [section] in this file declares a named "profile", which can be selected
# in tools like AWS Toolkit to choose which credentials you want to use.
#
# See also:
#   https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
#   https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html

`.trim()

const createNewCredentialsFile = (ctx: CredentialsTemplateContext) =>
    `
[${ctx.profileName}]
# This key identifies your AWS account.
aws_access_key_id = ${ctx.accessKey}
# Treat this secret key like a password. Never share it or store it in source
# control. If your secret key is ever disclosed, immediately use IAM to delete
# the key pair and create a new one.
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
        const files = [vscode.Uri.file(getConfigFilename()), vscode.Uri.file(getCredentialsFilename())]

        const filenames = await Promise.all(
            files.map(async (uri) => {
                if (await fs.exists(uri)) {
                    return uri.fsPath
                }
            })
        )

        return filenames.filter(isNonNullable)
    }

    /**
     * @description Determines if credentials directory exists
     * If it doesn't, creates credentials directory
     * at directory from getCredentialsFilename()
     */
    public static async generateCredentialDirectoryIfNonexistent(): Promise<void> {
        const filepath = path.dirname(getCredentialsFilename())
        if (!(await fileExists(filepath))) {
            await fs.mkdir(filepath)
        }
    }

    /**
     * @param credentialsContext the profile to create in the file
     */
    public static async generateCredentialsFile(credentialsContext?: CredentialsTemplateContext): Promise<void> {
        await this.generateCredentialDirectoryIfNonexistent()
        const dest = getCredentialsFilename()
        const contents = credentialsContext ? ['', createNewCredentialsFile(credentialsContext)] : []

        if (await fs.exists(dest)) {
            contents.unshift(await fs.readFileText(dest))
        } else {
            contents.unshift(header)
        }

        await fs.writeFile(dest, contents.join('\n'))
    }
}
