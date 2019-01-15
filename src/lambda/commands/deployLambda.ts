/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ext } from '../../shared/extensionGlobals'
import { FunctionNodeBase } from '../explorer/functionNode'

export async function deployLambda(element?: FunctionNodeBase) {
    try {
        // TODO: trigger build/package and deploy sequence appropriate to
        // the implementation language. We'll need some form of controller
        // abstraction around the various implementations.
        ext.vscode.window.showInformationMessage('Not yet implemented!')
    } catch (err) {

    }
}
