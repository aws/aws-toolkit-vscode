/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export async function newLambda() {
    try {
        // TODO: trigger multistep command sequence to select type (lamba/serverless).
        // language, blueprint and output location. See the multiStepInput.ts file in
        // the quickinput-sample for ideas.
        vscode.window.showInformationMessage('Not yet implemented!')
    } catch (err) {

    }
}
