/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    // avoid name collission with ext.vscode
    types as _vscode
} from './vscode'

import { AWSClientBuilder } from './awsClientBuilder'
import { AWSContextCommands } from './awsContextCommands'
import { AWSStatusBar } from './awsStatusBar'
import { ToolkitClientBuilder } from './clients/toolkitClientBuilder'
import { VSCodeContext } from './vscode/index'

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: _vscode.ExtensionContext
    export let outputChannel: _vscode.OutputChannel
    export let lambdaOutputChannel: _vscode.OutputChannel
    export let awsContextCommands: AWSContextCommands
    export let sdkClientBuilder: AWSClientBuilder
    export let toolkitClientBuilder: ToolkitClientBuilder
    export let statusBar: AWSStatusBar
    export let vscode: VSCodeContext
}
