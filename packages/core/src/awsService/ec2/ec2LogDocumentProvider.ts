/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Ec2Selection } from './prompter'
import { Ec2Client } from '../../shared/clients/ec2Client'
import { ec2LogsScheme } from '../../shared/constants'
import { UriSchema } from '../../shared/utilities/uriUtils'

export class Ec2LogDocumentProvider implements vscode.TextDocumentContentProvider {
    public constructor() {}

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        if (!ec2LogSchema.isValid(uri)) {
            throw new Error(`Invalid EC2 Logs URI: ${uri.toString()}`)
        }
        const ec2Selection = ec2LogSchema.parse(uri)
        const ec2Client = new Ec2Client(ec2Selection.region)
        const consoleOutput = await ec2Client.getConsoleOutput(ec2Selection.instanceId, false)
        return consoleOutput.Output
    }
}

export const ec2LogSchema = new UriSchema<Ec2Selection>(parseEc2Uri, formEc2Uri)

function parseEc2Uri(uri: vscode.Uri): Ec2Selection {
    const parts = uri.path.split(':')

    if (uri.scheme !== ec2LogsScheme) {
        throw new Error(`URI ${uri} is not parseable for EC2 Logs`)
    }

    return {
        instanceId: parts[1],
        region: parts[0],
    }
}

function formEc2Uri(selection: Ec2Selection): vscode.Uri {
    return vscode.Uri.parse(`${ec2LogsScheme}:${selection.region}:${selection.instanceId}`)
}
