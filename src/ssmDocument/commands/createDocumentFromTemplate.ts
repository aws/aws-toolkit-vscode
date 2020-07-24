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

export interface SsmDocumentTemplateQuickPickItem extends vscode.QuickPickItem {
    label: string
    filename: string
    language: string
    docType: string
}

const SSMDOCUMENT_TEMPLATES: SsmDocumentTemplateQuickPickItem[] = [
    {
        label: localize(
            'AWS.ssmDocument.template.automationJson.label',
            'Automation Document (schemaVersion 0.3, JSON)'
        ),
        filename: 'example.automation.ssm.json',
        language: 'ssm-json',
        docType: 'automation',
    },
    {
        label: localize(
            'AWS.ssmDocument.template.automationYaml.label',
            'Automation Document (schemaVersion 0.3, YAML)'
        ),
        filename: 'example.automation.ssm.yaml',
        language: 'ssm-yaml',
        docType: 'automation',
    },
    {
        label: localize('AWS.ssmDocument.template.command22Json.label', 'Command Document (schemaVersion 2.2, JSON)'),
        filename: 'example22.command.ssm.json',
        language: 'ssm-json',
        docType: 'command',
    },
    {
        label: localize('AWS.ssmDocument.template.command22Yaml.label', 'Command Document (schemaVersion 2.2, YAML)'),
        filename: 'example22.command.ssm.yaml',
        language: 'ssm-yaml',
        docType: 'command',
    },
]

export async function promptUserForTemplate(): Promise<SsmDocumentTemplateQuickPickItem | undefined> {
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

    return picker.verifySinglePickerOutput(choices)
}

export async function createSsmDocumentFromTemplate(): Promise<void> {
    const logger: Logger = getLogger()

    const selection = await promptUserForTemplate()

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
