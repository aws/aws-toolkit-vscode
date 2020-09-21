/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import * as YAML from 'yaml'
import { getLogger, Logger } from '../../shared/logger'
import * as picker from '../../shared/ui/picker'
import { promptUserForDocumentFormat } from '../util/util'
import { readFileAsString } from '../../shared/filesystemUtilities'

export interface SsmDocumentTemplateQuickPickItem {
    label: string
    description: string
    filename: string
    docType: string
}

const SSMDOCUMENT_TEMPLATES: SsmDocumentTemplateQuickPickItem[] = [
    {
        label: localize('AWS.ssmDocument.template.automationHelloWorldPython.label', 'Hello world using Python'),
        description: localize(
            'AWS.ssmDocument.template.automationHelloWorldPython.description',
            'An example of an Automation document using "`aws:executeScript`" with a Python script'
        ),
        filename: 'ssm/HelloWorldPython.ssm.yaml',
        docType: 'automation',
    },
    {
        label: localize(
            'AWS.ssmDocument.template.automationHelloWorldPowershell.label',
            'Hello world using Powershell'
        ),
        description: localize(
            'AWS.ssmDocument.template.automationHelloWorldPowershell.description',
            'An example of an Automation document using "`aws:executeScript`" with a Powershell script'
        ),
        filename: 'ssm/HelloWorldPowershell.ssm.yaml',
        docType: 'automation',
    },
]

export async function createSsmDocumentFromTemplate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const logger: Logger = getLogger()

    const quickPick = picker.createQuickPick<SsmDocumentTemplateQuickPickItem>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.message.prompt.selectSsmDocumentTemplate.placeholder', 'Select a document template'),
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: SSMDOCUMENT_TEMPLATES,
    })

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (_, resolve) => {
            resolve(undefined)
        },
    })

    const selection = picker.verifySinglePickerOutput(choices)

    // User pressed escape and didn't select a template
    if (selection === undefined) {
        return
    }

    try {
        logger.debug(`User selected the ${selection.label} template.`)
        const textDocument = await openTextDocumentFromSelection(selection, extensionContext.extensionPath)
        if (textDocument) {
            vscode.window.showTextDocument(textDocument)
        }
    } catch (err) {
        logger.error(err as Error)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.openTextDocumentFromSelection',
                'There was an error creating the SSM Document from the template, check log for details.'
            )
        )
    }
}

function yamlToJson(yaml: string): string {
    const jsonObject = YAML.parse(yaml)
    return JSON.stringify(jsonObject, undefined, '\t')
}

async function openTextDocumentFromSelection(
    item: SsmDocumentTemplateQuickPickItem,
    extensionPath: string
): Promise<vscode.TextDocument | undefined> {
    const templateYamlContent = await readFileAsString(path.join(extensionPath, 'templates', item.filename))
    const selectedDocumentFormat = await promptUserForDocumentFormat(['YAML', 'JSON'])

    // user pressed escape and didn't select a format
    if (selectedDocumentFormat === undefined) {
        return
    }

    let content: string
    let languageId: string
    if (selectedDocumentFormat === 'YAML') {
        content = templateYamlContent
        languageId = 'ssm-yaml'
    } else {
        content = yamlToJson(templateYamlContent)
        languageId = 'ssm-json'
    }
    return await vscode.workspace.openTextDocument({ content: content, language: languageId })
}
