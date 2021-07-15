/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Components associated with {@link module:vscode.workspace}.
 */
export interface Workspace {
    /**
     * See {@link module:vscode.workspace.getConfiguration}.
     */
    getConfiguration(section?: string, resource?: vscode.Uri | null): WorkspaceConfiguration
}

export namespace Workspace {
    export function vscode(): Workspace {
        return new DefaultWorkspace()
    }
}

export interface WorkspaceConfiguration {
    /**
     * See {@link module:vscode.WorkspaceConfiguration.get}.
     */
    get<T>(key: string): T | undefined

    update(
        key: string,
        value: any,
        configurationTarget?: boolean | vscode.ConfigurationTarget | undefined,
        overrideInLanguage?: boolean | undefined
    ): Thenable<void>
}

class DefaultWorkspace implements Workspace {
    public getConfiguration(section?: string, resource?: vscode.Uri | null): WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(section, resource)
    }
}
