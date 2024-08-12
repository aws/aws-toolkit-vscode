/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../errors'

/**
 * @description Finds the samconfig.toml file under the provided project folder
 * @param projectRoot The root folder of the application project
 * @returns The URI of the samconfig.toml file
 */
export async function getConfigFileUri(projectRoot: vscode.Uri) {
    const samConfigFilename = 'samconfig'
    const samConfigFile = (
        await vscode.workspace.findFiles(new vscode.RelativePattern(projectRoot, `${samConfigFilename}`))
    )[0]
    if (samConfigFile) {
        return samConfigFile
    } else {
        throw new ToolkitError(`No samconfig.toml file found in ${projectRoot.fsPath}`)
    }
}
