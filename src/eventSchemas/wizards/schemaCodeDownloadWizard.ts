/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Set as ImmutableSet } from 'immutable'
import * as vscode from 'vscode'

import { eventBridgeSchemasDocUrl } from '../../shared/constants'
import { createBackButton, createHelpButton } from '../../shared/ui/buttons'
import { Prompter, PrompterButtons } from '../../shared/ui/prompter'

import * as codeLang from '../models/schemaCodeLangs'

import { SchemaItemNode } from '../explorer/schemaItemNode'
import { createLocationPrompt } from '../../shared/ui/prompts'
import { Wizard } from '../../shared/wizards/wizard'
import { initializeInterface } from '../../shared/transformers'
import { createLabelQuickPick, QuickPickPrompter } from '../../shared/ui/picker'

export interface SchemaCodeDownloadWizardContext {
    readonly schemaLangs: ImmutableSet<codeLang.SchemaCodeLangs>
    readonly workspaceFolders?: readonly vscode.WorkspaceFolder[]

    createLanguagePrompter(): Prompter<codeLang.SchemaCodeLangs>
    createVersionPrompter(): Prompter<string>
    createLocationPrompter(): Prompter<vscode.Uri>
}

export class DefaultSchemaCodeDownloadWizardContext implements SchemaCodeDownloadWizardContext {
    public readonly schemaLangs = codeLang.schemaCodeLangs
    private readonly helpButton = createHelpButton(eventBridgeSchemasDocUrl)
    private readonly buttons: PrompterButtons = [createBackButton(), this.helpButton]

    constructor(
        private readonly node: SchemaItemNode,
        readonly workspaceFolders?: readonly vscode.WorkspaceFolder[]
    ) {
        this.node = node
    }

    public createLanguagePrompter(): QuickPickPrompter<codeLang.SchemaCodeLangs> {
        return createLabelQuickPick<codeLang.SchemaCodeLangs>(this.schemaLangs.toArray().map(language => ({ label: language })), {
            title: localize(
                'AWS.schemas.downloadCodeBindings.initWizard.language.prompt',
                'Select a code binding language'
            ),
            buttons: this.buttons,
        })
    }

    public createVersionPrompter(): QuickPickPrompter<string> {
        const items = this.node.listSchemaVersions().then(versions => versions.map(v => ({ label: v.SchemaVersion! })))

        return createLabelQuickPick(items, {
            title: localize(
                'AWS.schemas.downloadCodeBindings.initWizard.version.prompt',
                'Select a version for schema {0} :',
                this.node.schemaName
            ),
            buttons: this.buttons
        })
    }

    public createLocationPrompter(): QuickPickPrompter<vscode.Uri> {
        return createLocationPrompt(this.workspaceFolders, this.buttons, {
            detail: localize(
                'AWS.schemas.downloadCodeBindings.initWizard.location.select.folder.detail',
                'Code bindings will be downloaded to selected folder.'
            ),
            title: localize(
                'AWS.schemas.downloadCodeBindings.initWizard.location.prompt',
                'Select a workspace folder to download code bindings'
            ),
        })
    }
}

export interface SchemaCodeDownloadWizardResponse {
    language: codeLang.SchemaCodeLangs
    location: vscode.Uri
    schemaVersion: string
}

export class SchemaCodeDownloadWizard extends Wizard<SchemaCodeDownloadWizardResponse> {
    public constructor(readonly context: SchemaCodeDownloadWizardContext) {
        super(initializeInterface<SchemaCodeDownloadWizardResponse>())

        this.form.schemaVersion.bindPrompter(() => context.createVersionPrompter())
        this.form.language.bindPrompter(() => context.createLanguagePrompter())
        this.form.location.bindPrompter(() => context.createLocationPrompter())
    }
}
