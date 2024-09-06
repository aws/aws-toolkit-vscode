/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import * as yaml from 'js-yaml'
import { getLogger, Logger } from '../../shared/logger'
import * as picker from '../../shared/ui/picker'
import { promptUserForDocumentFormat } from '../util/util'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { Result, DocumentFormat } from '../../shared/telemetry/telemetry'
import { telemetry } from '../../shared/telemetry/telemetry'

export interface SsmDocumentTemplateQuickPickItem {
    label: string
    description: string
    filename: string
    docType: string
}

const ssmdocumentTemplates: SsmDocumentTemplateQuickPickItem[] = [
    {
        label: localize('AWS.ssmDocument.template.automationHelloWorldPython.label', 'Hello world using Python'),
        description: localize(
            'AWS.ssmDocument.template.automationHelloWorldPython.description',
            'An example of an Automation document using "`aws:executeScript`" with a Python script'
        ),
        filename: 'HelloWorldPython.ssm.yaml',
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
        filename: 'HelloWorldPowershell.ssm.yaml',
        docType: 'automation',
    },
]

export async function createSsmDocumentFromTemplate(extensionContext: vscode.ExtensionContext): Promise<void> {
    let result: Result = 'Succeeded'
    let format: DocumentFormat | undefined = undefined
    let templateName: string | undefined = undefined
    const logger: Logger = getLogger()

    const quickPick = picker.createQuickPick<SsmDocumentTemplateQuickPickItem>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.message.prompt.selectSsmDocumentTemplate.placeholder', 'Select a document template'),
            step: 1,
            totalSteps: 2,
        },
        buttons: [vscode.QuickInputButtons.Back],
        items: ssmdocumentTemplates,
    })

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (_, resolve) => {
            resolve(undefined)
        },
    })

    const selection = picker.verifySinglePickerOutput(choices)

    try {
        // User pressed escape and didn't select a template
        if (selection === undefined) {
            result = 'Cancelled'
        } else {
            logger.debug(`User selected template: ${selection.label}`)
            templateName = selection.label
            const selectedDocumentFormat = await promptUserForDocumentFormat(['YAML', 'JSON'], {
                step: 2,
                totalSteps: 2,
            })
            format = selectedDocumentFormat ? (selectedDocumentFormat as DocumentFormat) : format
            const textDocument: vscode.TextDocument | undefined = await openTextDocumentFromSelection(
                selection,
                extensionContext.extensionPath,
                selectedDocumentFormat
            )
            if (textDocument !== undefined) {
                await vscode.window.showTextDocument(textDocument)
            } else {
                result = 'Cancelled'
            }
        }
    } catch (err) {
        result = 'Failed'
        logger.error(err as Error)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.openTextDocumentFromSelection',
                'There was an error creating the SSM Document from the template, check log for details.'
            )
        )
    } finally {
        telemetry.ssm_createDocument.emit({
            result: result,
            documentFormat: format,
            starterTemplate: templateName,
        })
    }
}

function yamlToJson(yamlStr: string): string {
    const jsonObject = yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA })
    return JSON.stringify(jsonObject, undefined, 4)
}

async function openTextDocumentFromSelection(
    item: SsmDocumentTemplateQuickPickItem,
    extensionPath: string,
    selectedDocumentFormat: string | undefined
): Promise<vscode.TextDocument | undefined> {
    // By default the template content is YAML, so when the format is not Yaml, we convert to JSON.
    // We only support JSON and YAML for ssm documents
    const templateYamlContent = await readFileAsString(path.join(extensionPath, 'templates', item.filename))

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
