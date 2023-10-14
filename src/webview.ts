/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    provideVSCodeDesignSystem,
    vsCodeButton,
    vsCodeTag,
    vsCodeLink,
    vsCodeDivider,
} from '@vscode/webview-ui-toolkit'

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeLink(), vsCodeTag(), vsCodeDivider())

const vscode = acquireVsCodeApi()

window.addEventListener('message', event => {
    const message = event.data
    switch (message.command) {
        case 'cache':
            vscode.setState(message.issue)
            break
    }
})
