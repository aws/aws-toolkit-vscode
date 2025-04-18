/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { PredictionTracker } from './PredictionTracker'
import { PredictionKeyStrokeHandler } from './PredictionKeyStrokeHandler'
import { getLogger } from '../../shared/logger/logger'
import { ExtContext } from '../../shared/extensions'
import { SnapshotVisualizer } from './SnapshotVisualizer'

export let predictionTracker: PredictionTracker | undefined
let keyStrokeHandler: PredictionKeyStrokeHandler | undefined

/**
 * Activates the Next Edit Prediction system
 */
export function activateNextEditPrediction(context: ExtContext): void {
    // Initialize the tracker
    predictionTracker = new PredictionTracker(context.extensionContext)

    // Initialize the keystroke handler
    keyStrokeHandler = new PredictionKeyStrokeHandler(predictionTracker)

    // Register for disposal
    context.extensionContext.subscriptions.push(
        vscode.Disposable.from({
            dispose: () => {
                getLogger().info('Disposing Next Edit Prediction resources')
                keyStrokeHandler?.dispose()
                predictionTracker?.dispose()
            },
        })
    )

    // Register snapshot visualizer
    registerSnapshotVisualizer(context, predictionTracker)

    getLogger().info('Next Edit Prediction activated')
}

/**
 * Registers the snapshot visualizer command and status bar item
 */
function registerSnapshotVisualizer(context: ExtContext, tracker: PredictionTracker): void {
    // Create the visualizer
    const visualizer = new SnapshotVisualizer(context.extensionContext, tracker)

    // Register command
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('amazonQ.nextEditPrediction.showSnapshotVisualizer', () => {
            visualizer.show()
        })
    )

    // Add a status bar item to open the visualizer
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    statusBarItem.text = '$(history) NEP'
    statusBarItem.tooltip = 'Show Next Edit Prediction snapshot visualizer'
    statusBarItem.command = 'amazonQ.nextEditPrediction.showSnapshotVisualizer'
    statusBarItem.show()
    statusBarItem.show()
    context.extensionContext.subscriptions.push(statusBarItem)
}
