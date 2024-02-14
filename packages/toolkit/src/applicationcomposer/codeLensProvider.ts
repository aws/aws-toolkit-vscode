/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import * as CloudFormation from '../shared/cloudformation/cloudformation'
import * as nls from 'vscode-nls'
import { openTemplateInComposerCommand } from './commands/openTemplateInComposer'

const localize = nls.loadMessageBundle()

export class ApplicationComposerCodeLensProvider implements vscode.CodeLensProvider {
    public async provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const cfnTemplate = CloudFormation.isValidFilename(document.uri)
            ? await CloudFormation.tryLoad(document.uri)
            : undefined
        if (!cfnTemplate?.template) return []

        let codeLensLine = 0
        for (let i = 0; i < document.getText().length; i++) {
            const line = document.lineAt(i)
            const lineContents = line.text.substring(line.firstNonWhitespaceCharacterIndex)
            if (lineContents.length > 0 && !lineContents.startsWith('#')) {
                codeLensLine = i
                break
            }
        }
        const resourcesLoc = new vscode.Range(codeLensLine, 0, codeLensLine, 0)
        const codeLens = openTemplateInComposerCommand.build().asCodeLens(resourcesLoc, {
            title: localize('AWS.applicationComposer.codeLens.title', 'Open with Application Composer'),
            tooltip: localize(
                'AWS.applicationComposer.codeLens.tooltip',
                'Visually design and build modern applications quickly'
            ),
        })
        return [codeLens]
    }
}
