/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Ec2Selection } from './prompter'
import { Ec2Client } from '../../shared/clients/ec2Client'
import { EC2_LOGS_SCHEME } from '../../shared/constants'

export class Ec2LogDocumentProvider implements vscode.TextDocumentContentProvider {
    public constructor() {}

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        if (!isEc2Uri(uri)) {
            throw new Error(`Invalid EC2 Logs URI: ${uri.toString()}`)
        }
        const ec2Selection = parseEc2Uri(uri)
        const ec2Client = new Ec2Client(ec2Selection.region)
        const consoleOutput = await ec2Client.getConsoleOutput(ec2Selection.instanceId, false)
        return consoleOutput.Output
    }
}

function parseEc2Uri(uri: vscode.Uri): Ec2Selection {
    const parts = uri.path.split(':')

    if (uri.scheme !== EC2_LOGS_SCHEME) {
        throw new Error(`URI ${uri} is not parseable for EC2 Logs`)
    }

    return {
        instanceId: parts[1],
        region: parts[0],
    }
}

export function formEc2Uri(selection: Ec2Selection): vscode.Uri {
    return vscode.Uri.parse(`${EC2_LOGS_SCHEME}:${selection.region}:${selection.instanceId}`)
}

function isEc2Uri(uri: vscode.Uri): boolean {
    try {
        parseEc2Uri(uri)
        return true
    } catch {
        return false
    }
}
