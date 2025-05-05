/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { PredictionTracker } from './predictionTracker'
import { PredictionKeyStrokeHandler } from './predictionKeyStrokeHandler'
import { getLogger } from '../../shared/logger/logger'
import { ExtContext } from '../../shared/extensions'

export let predictionTracker: PredictionTracker | undefined
let keyStrokeHandler: PredictionKeyStrokeHandler | undefined

export function activateEditTracking(context: ExtContext): void {
    try {
        predictionTracker = new PredictionTracker(context.extensionContext)

        keyStrokeHandler = new PredictionKeyStrokeHandler(predictionTracker)
        context.extensionContext.subscriptions.push(
            vscode.Disposable.from({
                dispose: () => {
                    keyStrokeHandler?.dispose()
                },
            })
        )

        getLogger('nextEditPrediction').debug('Next Edit Prediction activated')
    } catch (error) {
        getLogger('nextEditPrediction').error(`Error in activateEditTracking: ${error}`)
    }
}
