/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../errors'

interface IServerlessLandProject {
    asset: string
    handler: string
}

export async function getWalkthrough(
    runtime: 'python' | 'node' | 'java' | 'dotnet' | string,
    project: 'API' | 'S3' | string,
    outputDir: vscode.Uri
): Promise<void> {
    const appMap = new Map<string, IServerlessLandProject>()
    appMap.set('APInode', { asset: 'apigw-iam', handler: 'src/app.js' })
    appMap.set('APIpython', { asset: 'hello-world-sam', handler: 'hello_world/app.py' })

    const appSelected = appMap.get(project + runtime)
    if (!appSelected) {
        throw new ToolkitError(`Tried to get template '${project}+${runtime}', but it hasn't been registered.`)
    }

    // TODO replace with getServerlessPattern
    // await getServerlesslandPattern(projectOwner, projectRepo, appSelected.asset, projectUri)
    const lambdaUri = vscode.Uri.joinPath(outputDir, appSelected.asset, appSelected.handler)
    const templateUri = vscode.Uri.joinPath(outputDir, 'template.yaml')
    // to remove after serverless land merged
    await vscode.workspace.fs.writeFile(lambdaUri, Buffer.from('test lambda'))
    await vscode.workspace.fs.writeFile(templateUri, Buffer.from('test template'))
}
