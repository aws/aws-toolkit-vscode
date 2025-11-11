/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { setContext } from '../../../shared/vscode/setContext'

export interface StackViewState {
    stackName?: string
    isChangeSetMode: boolean
    stackStatus?: string
}

export class StackViewCoordinator {
    private readonly _onDidChangeStack = new EventEmitter<StackViewState>()
    readonly onDidChangeStack = this._onDidChangeStack.event

    private _currentStackName?: string
    private _isChangeSetMode = false
    private _currentStackStatus?: string
    private _stackStatusUpdateCallback?: (stackName: string, stackStatus: string) => void

    get currentStackName(): string | undefined {
        return this._currentStackName
    }

    get isChangeSetMode(): boolean {
        return this._isChangeSetMode
    }

    get currentStackStatus(): string | undefined {
        return this._currentStackStatus
    }

    setStackStatusUpdateCallback(callback: (stackName: string, stackStatus: string) => void): void {
        this._stackStatusUpdateCallback = callback
    }

    async setStack(stackName: string, stackStatus?: string): Promise<void> {
        const statusChanged = stackStatus && this._currentStackStatus !== stackStatus

        this._currentStackName = stackName
        this._currentStackStatus = stackStatus
        this._isChangeSetMode = false
        await this.updateContexts()
        this._onDidChangeStack.fire(this.getState())

        if (statusChanged && stackStatus && this._stackStatusUpdateCallback) {
            this._stackStatusUpdateCallback(stackName, stackStatus)
        }
    }

    async setChangeSetMode(stackName: string, enabled: boolean): Promise<void> {
        this._currentStackName = stackName
        this._isChangeSetMode = enabled
        await this.updateContexts()
        this._onDidChangeStack.fire(this.getState())
    }

    async clearStack(): Promise<void> {
        this._currentStackName = undefined
        this._currentStackStatus = undefined
        this._isChangeSetMode = false
        await this.updateContexts()
        this._onDidChangeStack.fire(this.getState())
    }

    private async updateContexts(): Promise<void> {
        await setContext('aws.cloudformation.stackSelected', !!this._currentStackName)
        await setContext('aws.cloudformation.changeSetMode', this._isChangeSetMode)
    }

    private getState(): StackViewState {
        return {
            stackName: this._currentStackName,
            isChangeSetMode: this._isChangeSetMode,
            stackStatus: this._currentStackStatus,
        }
    }

    dispose(): void {
        this._onDidChangeStack.dispose()
    }
}
