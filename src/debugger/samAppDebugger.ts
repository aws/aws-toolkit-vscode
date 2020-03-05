/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DebugSession } from 'vscode-debugadapter'
import { DebugProtocol } from 'vscode-debugprotocol'

const SAM_APP_REQUEST_TYPES = new Set<string>(['direct-invoke'])
const SAM_APP_TARGET_TYPES = new Set<string>(['template', 'code'])

export interface SamAppDebugConfiguration {
    readonly invokeTarget: {
        readonly target: string
        readonly samTemplatePath: string
        readonly samTemplateResource: string
    }
    readonly lambda?: {
        // TODO: Turn samLambdaRuntimes into a type?
        readonly runtime?: string
        readonly timeoutSec?: number
        readonly memoryMb?: number
        readonly environmentVariables?: JsonObject
        readonly event?: {
            readonly path?: string
            readonly json?: JsonObject
        }
    }
    readonly sam?: {
        readonly containerBuild?: boolean
        readonly skipNewImageCheck?: boolean
        readonly dockerNetwork?: string
        readonly buildArguments?: string
        readonly localArguments?: string
        readonly template?: {
            readonly parameters?: JsonObject
        }
    }
    readonly aws?: {
        readonly credentials?: string
        readonly region?: string
    }
}

interface JsonObject {
    readonly [key: string]: string
}

class SamAppDebugger extends DebugSession {
    public constructor() {
        super()
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {}

    protected customRequest(command: string, response: DebugProtocol.Response, args: SamAppDebugConfiguration): void {
        if (SAM_APP_REQUEST_TYPES.has(command)) {
            vscode.window.showInformationMessage('Not implemented!')
            if (SAM_APP_TARGET_TYPES.has(args.invokeTarget.target)) {
                vscode.window.showInformationMessage('Not implemented, but your config is solid!')
            }
        } else {
            vscode.window.showInformationMessage("Not implemented, but the request type isn't supported anyway!")
        }
    }
}

SamAppDebugger.run(SamAppDebugger)
