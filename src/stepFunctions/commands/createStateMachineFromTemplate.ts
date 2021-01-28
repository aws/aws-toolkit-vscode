/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { safeDump, safeLoad } from 'js-yaml'

import * as path from 'path'
import * as vscode from 'vscode'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { getLogger, Logger } from '../../shared/logger'
import CreateStateMachineWizard, {
    StateMachineTemplateQuickPickItem,
    TemplateFormats,
} from '../wizards/createStateMachineWizard'

export async function createStateMachineFromTemplate(context: vscode.ExtensionContext) {
    const logger: Logger = getLogger()

    const wizardResponse = await new CreateStateMachineWizard().run()

    if (wizardResponse && wizardResponse.template && wizardResponse.templateFormat) {
        try {
            logger.debug(
                `User selected the ${wizardResponse.template.label} template of ${wizardResponse.templateFormat} format`
            )

            const textDocumentFromSelection = await getTextDocumentForSelectedItem(
                wizardResponse.template,
                context.extensionPath,
                wizardResponse.templateFormat
            )

            vscode.window.showTextDocument(textDocumentFromSelection)
        } catch (err) {
            logger.error(err as Error)
            vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.stepfunctions.getTextDocumentForSelectedItem',
                    'There was an error creating the State Machine Template, check log for details.'
                )
            )
        }
    }
}

async function getTextDocumentForSelectedItem(
    item: StateMachineTemplateQuickPickItem,
    extensionPath: string,
    format: string
): Promise<vscode.TextDocument> {
    let content = await readFileAsString(path.join(extensionPath, 'templates', item.fileName))

    if (format === TemplateFormats.YAML) {
        // Convert JSON string to YAML string
        content = safeDump(safeLoad(content))
    }

    const options = {
        content,
        language: format === TemplateFormats.YAML ? 'asl-yaml' : 'asl',
    }

    return await vscode.workspace.openTextDocument(options)
}
