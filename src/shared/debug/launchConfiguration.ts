/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import {
    AwsSamDebuggerConfiguration,
    isAwsSamDebugConfiguration,
    ensureRelativePaths,
} from '../sam/debugger/awsSamDebugConfiguration'
import {
    AwsSamDebugConfigurationValidator,
    DefaultAwsSamDebugConfigurationValidator,
} from '../sam/debugger/awsSamDebugConfigurationValidator'
import { CloudFormationTemplateRegistry } from '../cloudformation/templateRegistry'

/**
 * Reads and writes DebugConfigurations.
 */
export interface DebugConfigurationSource {
    getDebugConfigurations(): vscode.DebugConfiguration[]
    setDebugConfigurations(value: vscode.DebugConfiguration[]): Promise<void>
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
        private readonly configSource: DebugConfigurationSource = new DefaultDebugConfigSource(resource),
        private readonly samValidator: AwsSamDebugConfigurationValidator = new DefaultAwsSamDebugConfigurationValidator(
            CloudFormationTemplateRegistry.getRegistry(),
            vscode.workspace.getWorkspaceFolder(resource)
        )
    ) {}

    public getDebugConfigurations(): vscode.DebugConfiguration[] {
        return _(this.configSource.getDebugConfigurations())
            .map(o => {
                if (isAwsSamDebugConfiguration(o)) {
                    ensureRelativePaths(undefined, o)
                }
                return o
            })
            .value()
    }

    /**
     * Returns all valid Sam Debug Configurations.
     */
    public getSamDebugConfigurations(): AwsSamDebuggerConfiguration[] {
        return _(this.getDebugConfigurations())
            .filter(isAwsSamDebugConfiguration)
            .filter(config => this.samValidator.validate(config)?.isValid)
            .value()
    }

    /**
     * Adds a debug configuration to the top of the list.
     */
    public async addDebugConfiguration(debugConfig: vscode.DebugConfiguration): Promise<void> {
        await this.configSource.setDebugConfigurations([debugConfig, ...this.getDebugConfigurations()])
    }
}

class DefaultDebugConfigSource implements DebugConfigurationSource {
    private readonly launch: vscode.WorkspaceConfiguration

    public constructor(resource: vscode.Uri) {
        this.launch = vscode.workspace.getConfiguration('launch', resource)
    }

    public getDebugConfigurations(): vscode.DebugConfiguration[] {
        return this.launch.get<vscode.DebugConfiguration[]>('configurations') ?? []
    }

    public async setDebugConfigurations(value: vscode.DebugConfiguration[]): Promise<void> {
        await this.launch.update('configurations', value)
    }
}
