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
import * as telemetry from '../../shared/telemetry/telemetry'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { SSM } from 'aws-sdk'
import { Wizard } from '../../shared/wizards/wizard'
import { initializeInterface } from '../../shared/transformers'
import { Prompter, PrompterButtons } from '../../shared/ui/prompter'
import { createBackButton } from '../../shared/ui/buttons'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/picker'
import { createLabelQuickPick } from '../../shared/ui/picker'

export interface SsmDocumentTemplateQuickPickItem {
    label: string
    description: string
    filename: string
    docType: string
}

const SSMDOCUMENT_TEMPLATES: DataQuickPickItem<SSMDocument>[] = [
    {
        label: localize('AWS.ssmDocument.template.automationHelloWorldPython.label', 'Hello world using Python'),
        description: localize(
            'AWS.ssmDocument.template.automationHelloWorldPython.description',
            'An example of an Automation document using "`aws:executeScript`" with a Python script'
        ),
        data: {
            templateName: 'Hello world using Python',
            filename: 'HelloWorldPython.ssm.yaml',
            docType: 'Automation',
        },
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
        data: {
            templateName: 'Hello world using Powershell',
            filename: 'HelloWorldPowershell.ssm.yaml',
            docType: 'Automation',
        },
    },
]

export interface SSMDocument {
    templateName: string,
    filename: string,
    docType: SSM.DocumentType,
}

interface CreateSSMDocumentWizardFrom {
    document: SSMDocument,
    documentFormat: SSM.DocumentFormat,
}

export interface CreateSSMDocumentFromTemplateContext {
    createDocumentFormatPrompter(formats: SSM.DocumentFormat[]): Prompter<SSM.DocumentFormat>
    createDocumentTemplatePrompter(): Prompter<SSMDocument>
}

class DefaultCreateSSMDocumentFromTemplateContext implements CreateSSMDocumentFromTemplateContext {
    private readonly buttons: PrompterButtons = [createBackButton()]
    public createDocumentFormatPrompter(formats: SSM.DocumentFormat[]): QuickPickPrompter<SSM.DocumentFormat> {
        return createLabelQuickPick(formats.map(format => ({
            label: format,
            description: `Download document as ${format}`,
        })), {
            title: localize('AWS.message.prompt.selectSsmDocumentFormat.placeholder', 'Select a document format'),
            buttons: this.buttons
        })
    }

    public createDocumentTemplatePrompter(): QuickPickPrompter<SSMDocument> {
        return createQuickPick(SSMDOCUMENT_TEMPLATES, {
            title: localize('AWS.message.prompt.selectSsmDocumentTemplate.placeholder', 'Select a document template'),
            buttons: this.buttons
        })
    }
}
class CreateSSMDocumentWizard extends Wizard<CreateSSMDocumentWizardFrom> {
    constructor(context: CreateSSMDocumentFromTemplateContext = new DefaultCreateSSMDocumentFromTemplateContext()) {
        super(initializeInterface<CreateSSMDocumentWizardFrom>())
        const formats = ['YAML', 'JSON'] 
        this.form.document.bindPrompter(() => context.createDocumentTemplatePrompter())
        this.form.documentFormat.bindPrompter(() => context.createDocumentFormatPrompter(formats))
    }
}

export async function createSsmDocumentFromTemplate(
    extensionContext: vscode.ExtensionContext, 
    wizardContext?: CreateSSMDocumentFromTemplateContext
): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const logger: Logger = getLogger()

    const userResponse = await (new CreateSSMDocumentWizard(wizardContext)).run()

    try {
        // User pressed escape and didn't select a template
        if (userResponse === undefined) {
            result = 'Cancelled'
        } else {
            //logger.debug(`User selected template: ${userResponse.label}`)
            const textDocument: vscode.TextDocument | undefined = await openTextDocumentFromSelection(
                userResponse.document.filename,
                extensionContext.extensionPath,
                userResponse.documentFormat,
            )
            if (textDocument !== undefined) {
                vscode.window.showTextDocument(textDocument)
            } else {
                result = 'Cancelled'
            }
        }
    } catch (err) {
        result = 'Failed'
        logger.error(err as Error)
        vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.ssmDocument.openTextDocumentFromSelection',
                'There was an error creating the SSM Document from the template, check log for details.'
            )
        )
    } finally {
        // TODO: add telemetry capacity directly to Wizard class
        telemetry.recordSsmCreateDocument({
            result: result,
            documentFormat: userResponse?.documentFormat as any, // telemetry types are bugged
            starterTemplate: userResponse?.document.templateName,
        })
    }
}

function yamlToJson(yaml: string): string {
    const jsonObject = YAML.parse(yaml)
    return JSON.stringify(jsonObject, undefined, '\t')
}

async function openTextDocumentFromSelection(
    filename: string,
    extensionPath: string,
    selectedDocumentFormat: string | undefined
): Promise<vscode.TextDocument | undefined> {
    // By default the template content is YAML, so when the format is not Yaml, we convert to JSON.
    // We only support JSON and YAML for ssm documents
    const templateYamlContent = await readFileAsString(path.join(extensionPath, 'templates', filename))

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
