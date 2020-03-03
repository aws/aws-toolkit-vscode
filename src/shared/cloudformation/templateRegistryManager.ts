/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormationTemplateRegistry } from './templateRegistry'

export class CloudFormationTemplateRegistryManager implements vscode.Disposable {

    // we may want to move this to non-static to handle globs from any added watchers
    // consider creating watchers from this class?
    public static TEMPLATE_FILE_GLOB_PATTERN = '**/template.{yaml,yml}'
    private readonly disposables: vscode.Disposable[] = []
    private _isDisposed: boolean = false

    public constructor(
        private readonly registry: CloudFormationTemplateRegistry
    ) {
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rebuildRegistry()
            })
        )
    }

    public addWatcher(watcher: vscode.FileSystemWatcher) {
        this.disposables.push(
            watcher.onDidChange(async (uri) => this.registry.addTemplateToRegistry(uri))
        )
        this.disposables.push(
            watcher.onDidCreate(async (uri) => this.registry.addTemplateToRegistry(uri))
        )
        this.disposables.push(
            watcher.onDidDelete(async (uri) => this.registry.removeTemplateFromRegistry(uri))
        )
    }

    public async rebuildRegistry(): Promise<void> {
        this.registry.reset()
        const templateUris = await vscode.workspace.findFiles(CloudFormationTemplateRegistryManager.TEMPLATE_FILE_GLOB_PATTERN)
        await this.registry.addTemplatesToRegistry(templateUris)
    }

    public dispose() {
        if (!this._isDisposed) {
            for (const disposable of this.disposables) {
                disposable.dispose()
            }
            this._isDisposed = true
        }
    }
}
