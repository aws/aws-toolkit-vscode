/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../../../shared/vscode/commands2'
import { Container } from '../../service/serviceContainer'

export const refreshAnnotation = Commands.register(
    { id: 'aws.codeWhisperer.refreshAnnotation', logging: false },
    () => {
        Container.instance._editorGutterController.refresh(vscode.window.activeTextEditor)
        Container.instance._lineAnnotationController.refreshDebounced(vscode.window.activeTextEditor, 'editor')
    }
)
