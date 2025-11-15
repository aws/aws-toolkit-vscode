/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window, StatusBarAlignment, StatusBarItem, ThemeColor } from 'vscode'
import { StackActionPhase } from '../stacks/actions/stackActionRequestType'

let globalStatusBarItem: StatusBarItem | undefined

function getStatusProperties(status: StackActionPhase): { text: string; color: ThemeColor | undefined } {
    let color: ThemeColor | undefined = undefined
    let text: string

    switch (status) {
        case StackActionPhase.DEPLOYMENT_STARTED:
            text = '$(sync~spin) Validation Starting...'
            break
        case StackActionPhase.VALIDATION_IN_PROGRESS:
            text = '$(sync~spin) Validating Template...'
            break
        case StackActionPhase.VALIDATION_COMPLETE:
            text = '$(check) Validation Complete'
            break
        case StackActionPhase.VALIDATION_FAILED:
            text = '$(error) Validation Failed'
            color = new ThemeColor('statusBarItem.errorBackground')
            break
        case StackActionPhase.DEPLOYMENT_IN_PROGRESS:
            text = '$(sync~spin) Deploying Stack...'
            break
        case StackActionPhase.DEPLOYMENT_COMPLETE:
            text = '$(check) Deployment Complete'
            break
        case StackActionPhase.DEPLOYMENT_FAILED:
            text = '$(error) Deployment Failed'
            color = new ThemeColor('statusBarItem.errorBackground')
            break
        default:
            text = '$(sync~spin) Processing...'
    }

    return { text, color }
}

export function createDeploymentStatusBar(): StatusBarItem {
    globalStatusBarItem ??= window.createStatusBarItem(StatusBarAlignment.Left, 100)

    globalStatusBarItem.text = '$(sync~spin) Validation Starting...'
    globalStatusBarItem.show()

    return globalStatusBarItem
}

export function updateWorkflowStatus(statusBarItem: StatusBarItem, status: StackActionPhase): void {
    const properties = getStatusProperties(status)

    statusBarItem.text = properties.text
    statusBarItem.backgroundColor = properties.color
}
