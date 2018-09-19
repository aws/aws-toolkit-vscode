/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

import * as vscode from 'vscode'
import { FunctionNode } from "../explorer/functionNode"

export async function deployLambda(element?: FunctionNode) {
    try {
        // TODO: trigger build/package and deploy sequence appropriate to
        // the implementation language. We'll need some form of controller
        // abstraction around the various implementations.
        vscode.window.showInformationMessage('Not yet implemented!')
    } catch (err) {

    }
}

