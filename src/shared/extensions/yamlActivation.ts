/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as path from 'path'
import globals from '../extensionGlobals'

import { VSCODE_EXTENSION_ID } from '../extensions'
import { getIdeProperties, getIdeType, IDE } from '../extensionUtilities'
import { getLogger } from '../logger'
import { PromptSettings } from '../settings'
import { awsFiletypeFileNames, AWSFiletypeNames } from '../awsFiletypes'
import { dontShow } from '../localizedText'

const localize = nls.loadMessageBundle()

export async function activate(): Promise<void> {
    await createYamlExtensionPrompt()
}

/**
 * Creates a prompt (via toast) to guide users to installing the Red Hat YAML extension.
 * This is necessary for displaying codelenses on templaye YAML files.
 * Will show once per extension activation at most (all prompting triggers are disposed of on first trigger)
 * Will not show if the YAML extension is installed or if a user has permanently dismissed the message.
 */
async function createYamlExtensionPrompt(): Promise<void> {
    const settings = PromptSettings.instance

    // Show this only in VSCode since other VSCode-like IDEs (e.g. Theia) may
    // not have a marketplace or contain the YAML plugin.
    if (
        (await settings.isPromptEnabled('yamlExtPrompt')) &&
        getIdeType() === IDE.vscode &&
        !vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml)
    ) {
        // Disposed immediately after showing one, so the user isn't prompted
        // more than once per session.
        const yamlPromptDisposables: vscode.Disposable[] = []

        // user opens a template file
        vscode.workspace.onDidOpenTextDocument(
            async (doc: vscode.TextDocument) => {
                promptInstallYamlPluginFromFilename(doc.fileName, yamlPromptDisposables)
            },
            undefined,
            yamlPromptDisposables
        )

        // user swaps to an already-open template file that didn't have focus
        vscode.window.onDidChangeActiveTextEditor(
            async (editor: vscode.TextEditor | undefined) => {
                await promptInstallYamlPluginFromEditor(editor, yamlPromptDisposables)
            },
            undefined,
            yamlPromptDisposables
        )

        /**
         * Prompt the user to install the YAML plugin when AWSTemplateFormatVersion becomes available as a top level key
         * in the document
         * @param event An vscode text document change event
         * @returns nothing
         */
        async function promptOnAWSTemplateFormatVersion(event: vscode.TextDocumentChangeEvent): Promise<void> {
            for (const change of event.contentChanges) {
                const changedLine = event.document.lineAt(change.range.start.line)
                if (changedLine.text.includes('AWSTemplateFormatVersion')) {
                    promptInstallYamlPlugin(yamlPromptDisposables, 'CloudFormation')
                    return
                }
            }
            return
        }

        const promptNotifications = new Map<string, Promise<unknown>>()
        vscode.workspace.onDidChangeTextDocument(
            (event: vscode.TextDocumentChangeEvent) => {
                const uri = event.document.uri.toString()
                if (
                    event.document.languageId === 'yaml' &&
                    !vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml) &&
                    !promptNotifications.has(uri)
                ) {
                    promptNotifications.set(
                        uri,
                        promptOnAWSTemplateFormatVersion(event).finally(() => promptNotifications.delete(uri))
                    )
                }
            },
            undefined,
            yamlPromptDisposables
        )

        vscode.workspace.onDidCloseTextDocument((event: vscode.TextDocument) => {
            promptNotifications.delete(event.uri.toString())
        })

        // user already has an open template with focus
        // prescreen if a template.yaml is current open so we only call once
        const openTemplateYamls = vscode.window.visibleTextEditors.filter(editor => {
            const fileName = editor.document.fileName
            return getAWSFileName(fileName) !== undefined
        })

        if (openTemplateYamls.length > 0) {
            promptInstallYamlPluginFromEditor(openTemplateYamls[0], yamlPromptDisposables)
        }
    }
}

/**
 * Gets the matching aws file type from a filename
 * @param fileName The name of the incoming file
 * @returns The matching aws file type or undefined
 */
function getAWSFileName(fileName: string): AWSFiletypeNames | undefined {
    for (const [type, names] of Object.entries(awsFiletypeFileNames)) {
        for (const name of names) {
            if (fileName.endsWith(name)) {
                return type as AWSFiletypeNames
            }
        }
    }
    return undefined
}

async function promptInstallYamlPluginFromEditor(
    editor: vscode.TextEditor | undefined,
    disposables: vscode.Disposable[]
): Promise<void> {
    if (editor) {
        promptInstallYamlPluginFromFilename(editor.document.fileName, disposables)

        if (!path.isAbsolute(editor.document.uri.fsPath)) {
            return
        }

        if (globals.templateRegistry.cfn?.getRegisteredItem(editor.document.uri)) {
            promptInstallYamlPlugin(disposables, 'CloudFormation')
        }

        if (globals.templateRegistry.buildspec?.getRegisteredItem(editor.document.uri)) {
            promptInstallYamlPlugin(disposables, 'Buildspec')
        }
    }
}

/**
 * Prompt user to install YAML plugin for template.yaml and template.yml files
 * @param fileName File name to check against
 * @param disposables List of disposables to dispose of when the filename is a template YAML file
 */
async function promptInstallYamlPluginFromFilename(fileName: string, disposables: vscode.Disposable[]): Promise<void> {
    const awsFileName = getAWSFileName(fileName)
    if (awsFileName) {
        promptInstallYamlPlugin(disposables, awsFileName)
    }
}

/**
 * Show the install YAML extension prompt and dispose other listeners
 * @param disposables
 */
async function promptInstallYamlPlugin(disposables: vscode.Disposable[], templateName?: AWSFiletypeNames) {
    // immediately dispose other triggers so it doesn't flash again
    for (const prompt of disposables) {
        prompt.dispose()
    }
    const settings = PromptSettings.instance

    const installBtn = localize('AWS.missingExtension.install', 'Install...')

    const template = templateName ? templateName : 'YAML'
    const response = await vscode.window.showInformationMessage(
        localize(
            'AWS.message.info.yaml.prompt',
            'Install YAML extension for more {0} features in {1} files',
            getIdeProperties().company,
            template
        ),
        installBtn,
        dontShow
    )

    switch (response) {
        case installBtn:
            // Available options are:
            // extension.open: opens extension page in VS Code extension marketplace view
            // workspace.extension.installPlugin: autoinstalls plugin with no additional feedback
            // workspace.extension.search: preloads and executes a search in the extension sidebar with the given term

            // not sure if these are 100% stable.
            // Opting for `extension.open` as this gives the user a good path forward to install while not doing anything potentially unexpected.
            try {
                await vscode.commands.executeCommand('extension.open', VSCODE_EXTENSION_ID.yaml)
            } catch (e) {
                const err = e as Error
                getLogger().error(`Extension ${VSCODE_EXTENSION_ID.yaml} could not be opened: `, err.message)
            }
            break
        case dontShow:
            settings.disablePrompt('yamlExtPrompt')
    }
}
