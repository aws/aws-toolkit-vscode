/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface AwsSamDebuggerConfiguration extends vscode.DebugConfiguration {
    readonly invokeTarget: AwsSamDebuggerInvokeTargetFields
    readonly lambda?: AwsSamDebuggerLambdaFields
    readonly sam?: AwsSamDebuggerSamFields
    readonly aws?: AwsSamDebuggerAwsFields
}

interface ReadonlyJsonObject {
    readonly [key: string]: string | number | boolean
}

export interface AwsSamDebuggerAwsFields {
    readonly credentials?: string
    readonly region?: string
}

export interface AwsSamDebuggerInvokeTargetFields {
    readonly target: string
    readonly lambdaHandler?: string
    readonly projectRoot?: string
    readonly samTemplatePath?: string
    readonly samTemplateResource?: string
}

export interface AwsSamDebuggerInvokeTargetCodeFields extends AwsSamDebuggerInvokeTargetFields {
    readonly target: 'code'
    readonly lambdaHandler: string
    readonly projectRoot: string
}

export interface AwsSamDebuggerInvokeTargetTemplateFields extends AwsSamDebuggerInvokeTargetFields {
    readonly target: 'template'
    readonly samTemplatePath: string
    readonly samTemplateResource: string
}

export interface AwsSamDebuggerLambdaFields {
    readonly environmentVariables?: ReadonlyJsonObject
    readonly event?: {
        readonly path?: string
        readonly json?: ReadonlyJsonObject
    }
    readonly memoryMb?: number
    readonly runtime?: string
    readonly timeoutSec?: number
}

export interface AwsSamDebuggerSamFields {
    readonly buildArguments?: string
    readonly containerBuild?: boolean
    readonly dockerNetwork?: string
    readonly localArguments?: string
    readonly skipNewImageCheck?: boolean
    readonly template?: {
        readonly parameters?: ReadonlyJsonObject
    }
}
