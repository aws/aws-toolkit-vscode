/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { dump, load } from 'js-yaml'

import * as path from 'path'
import * as vscode from 'vscode'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import { CreateStateMachineWizard, TemplateFormats } from '../wizards/createStateMachineWizard'

import { YAML_ASL, JSON_ASL } from '../constants/aslFormats'

export async function createStateMachineFromTemplate(context: vscode.ExtensionContext) {
    const response = await new CreateStateMachineWizard().run()
    if (!response) {
        return
    }

    try {
        const textDocumentFromSelection = await getTextDocumentForSelectedItem(
            response.templateFile,
            context.extensionPath,
            response.templateFormat
        )

        await vscode.window.showTextDocument(textDocumentFromSelection)
    } catch (err) {
        getLogger().error(err as Error)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.stepfunctions.getTextDocumentForSelectedItem',
                'There was an error creating the State Machine Template, check log for details.'
            )
        )
    }
}

async function getTextDocumentForSelectedItem(
    fileName: string,
    extensionPath: string,
    format: string
): Promise<vscode.TextDocument> {
    let content = await readFileAsString(path.join(extensionPath, 'templates', fileName))

    if (format === TemplateFormats.YAML) {
        // Convert JSON string to YAML string
        content = dump(load(content))
    }

    const options = {
        content,
        language: format === TemplateFormats.YAML ? YAML_ASL : JSON_ASL,
    }

    return await vscode.workspace.openTextDocument(options)
}
