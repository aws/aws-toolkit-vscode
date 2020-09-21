/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as YAML from 'yaml'
import { getLogger, Logger } from '../../shared/logger'
import * as picker from '../../shared/ui/picker'
import { openAndSaveDocument } from '../util/util'

import { getDocumentTemplate } from 'aws-ssm-document-language-service'

export interface SsmDocumentTemplateQuickPickItem {
    label: string
    description: string
    filename: string
    language: string
    docType: string
}

const SSMDOCUMENT_TEMPLATES: SsmDocumentTemplateQuickPickItem[] = [
    {
        label: localize('AWS.ssmDocument.template.automationJson.label', 'JSON Automation Document'),
        description: localize(
            'AWS.ssmDocument.template.automationJson.description',
            'Sample automation document using schemaVersion 0.3 in JSON'
        ),
        filename: 'example.automation.ssm.json',
        language: 'ssm-json',
        docType: 'automation',
    },
    {
        label: localize('AWS.ssmDocument.template.automationYaml.label', 'YAML Automation Document'),
        description: localize(
            'AWS.ssmDocument.template.automationYaml.description',
            'Sample automation document using schemaVersion 0.3 in YAML'
        ),
        filename: 'example.automation.ssm.yaml',
        language: 'ssm-yaml',
        docType: 'automation',
    },
]

export async function createSsmDocumentFromTemplate(): Promise<void> {
    const logger: Logger = getLogger()

    const quickPick = picker.createQuickPick<SsmDocumentTemplateQuickPickItem>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.message.prompt.selectSsmDocumentTemplate.placeholder', 'Select a document templete'),
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
        const textDocument: vscode.TextDocument = await openTextDocumentFromSelection(selection)
        vscode.window.showTextDocument(textDocument)
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

async function openTextDocumentFromSelection(item: SsmDocumentTemplateQuickPickItem): Promise<vscode.TextDocument> {
    const template: object = getDocumentTemplate(item.docType)
    let content: string
    if (item.language === 'ssm-yaml') {
        content = YAML.stringify(template)
    } else {
        content = JSON.stringify(template, undefined, '\t')
    }

    return await openAndSaveDocument(content, item.filename, item.language)
}
