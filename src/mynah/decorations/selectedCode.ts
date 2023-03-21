/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'

export const mynahSelectedCodeDecorator: vs.TextEditorDecorationType = vs.window.createTextEditorDecorationType({
    after: {
        color: 'var(--vscode-editorInlayHint-foreground)',
        backgroundColor: 'var(--vscode-editorInlayHint-background)',
        fontStyle: 'italic',
        border: '2px solid var(--vscode-editorInlayHint-background)',
        margin: '0 0 0 8px',
        contentText: 'Select these lines and see code examples with CTRL/CMD+M',
    },
    backgroundColor: new vs.ThemeColor('inputOption.activeBackground'),
    rangeBehavior: vs.DecorationRangeBehavior.OpenOpen,
    overviewRulerLane: vs.OverviewRulerLane.Right,
    isWholeLine: true,
})
