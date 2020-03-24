/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import { AwsSamDebuggerConfiguration } from '../sam/debugger/awsSamDebugConfiguration'
import { AWS_SAM_DEBUG_TYPE } from '../sam/debugger/awsSamDebugger'

/**
 * Reads and writes DebugConfigurations.
 */
export interface DebugConfigurationSource {
    getDebugConfigurations(): vscode.DebugConfiguration[]
    updateDebugConfigurations(value: vscode.DebugConfiguration[]): Promise<void>
}

/**
 * Wraps read and write operations on launch.json.
 */
export class LaunchConfiguration {
    /**
     * Creates a Launch Configuration scoped to the given resource.
     */
    public constructor(
        resource: vscode.Uri,
        private readonly configSource: DebugConfigurationSource = new DefaultDebugConfigSource(resource)
    ) {}

    public getDebugConfigurations(): vscode.DebugConfiguration[] {
        return this.configSource.getDebugConfigurations()
    }

    public getSamDebugConfigurations(): AwsSamDebuggerConfiguration[] {
        return _(this.getDebugConfigurations())
            .filter({ type: AWS_SAM_DEBUG_TYPE })
            .map(config => config as AwsSamDebuggerConfiguration)
            .value()
    }

    /**
     * Adds a debug configuration to the top of the list.
     */
    public async addDebugConfiguration(debugConfig: vscode.DebugConfiguration): Promise<void> {
        await this.configSource.updateDebugConfigurations([debugConfig, ...this.getDebugConfigurations()])
    }
}

class DefaultDebugConfigSource implements DebugConfigurationSource {
    private readonly launch: vscode.WorkspaceConfiguration

    public constructor(resource: vscode.Uri) {
        this.launch = vscode.workspace.getConfiguration('launch', resource)
    }

    public getDebugConfigurations(): vscode.DebugConfiguration[] {
        return this.launch.get<vscode.DebugConfiguration[]>('configurations') || []
    }

    public async updateDebugConfigurations(value: vscode.DebugConfiguration[]): Promise<void> {
        await this.launch.update('configurations', value)
    }
}
