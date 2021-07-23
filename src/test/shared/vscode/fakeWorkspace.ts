/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Workspace, WorkspaceConfiguration } from '../../../shared/vscode/workspace'

export interface FakeWorkspaceOptions {
    section?: string
    configuration?: ConfigurationOptions
}

export class FakeWorkspace implements Workspace {
    private readonly _section: string | undefined
    private readonly _configuration: DefaultFakeConfiguration

    public get configuration(): FakeConfiguration {
        return this._configuration
    }

    public getConfiguration(section?: string, resource?: vscode.Uri | null): WorkspaceConfiguration {
        if (section === this._section) {
            return this._configuration
        }

        return new DefaultFakeConfiguration()
    }

    public constructor({ section, configuration }: FakeWorkspaceOptions = {}) {
        this._section = section
        this._configuration = new DefaultFakeConfiguration(configuration)
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigurationOptions {
    /**
     * The configuration key to
     */
    key?: string

    /**
     * The configuration value to respond with, if any.
     */
    value?: any
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FakeConfiguration {}

class DefaultFakeConfiguration implements WorkspaceConfiguration, FakeConfiguration {
    private readonly map: Map<string, any> = new Map<string, any>()

    /**
     * @returns the {@link value}.
     */
    public get<T>(key: string): T | undefined {
        if (this.map.has(key)) {
            return this.map.get(key) as T | undefined
        }

        return undefined
    }

    public async update(key: string, value: any): Promise<void> {
        this.map.set(key, value)
    }

    public constructor({ key, value }: ConfigurationOptions = {}) {
        if (key) {
            this.map.set(key, value)
        }
    }
}
