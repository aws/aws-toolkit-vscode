/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { FunctionNodeBase } from '../explorer/functionNode'
import { FunctionInfo } from '../functionInfo'

class QuickPickLambda extends FunctionNodeBase implements vscode.QuickPickItem {
    public description?: string | undefined
    public detail?: string | undefined
    public picked?: boolean | undefined

    public constructor(info: FunctionInfo) {
        super(info)
    }

    public get label(): string {
        return super.label || ''
    }
}

export async function quickPickLambda(lambdas: FunctionInfo[]): Promise<FunctionNodeBase | undefined> {
    try {
        if (!lambdas || lambdas.length === 0) {
            vscode.window.showInformationMessage(localize(
                'AWS.explorerNode.lambda.noFunctions',
                '[no functions in this region]'
            ))
        } else {
            const qpLambdas = lambdas.map(l => new QuickPickLambda(l))

            return await vscode.window.showQuickPick(qpLambdas, { placeHolder: 'Choose a lambda' })
        }
        throw new Error('No lambdas to work with.')
    } catch (error) {
        vscode.window.showErrorMessage('Unable to connect to AWS.')
    }
}
