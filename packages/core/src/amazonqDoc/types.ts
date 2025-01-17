/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemButton, MynahIcons, ProgressField } from '@aws/mynah-ui'
import {
    LLMResponseType,
    SessionStorage,
    SessionInfo,
    DeletedFileInfo,
    NewFileInfo,
    NewFileZipContents,
    SessionStateConfig,
    SessionStatePhase,
    DevPhase,
    Interaction,
    CurrentWsFolders,
    CodeGenerationStatus,
    SessionState as FeatureDevSessionState,
    SessionStateAction as FeatureDevSessionStateAction,
    SessionStateInteraction as FeatureDevSessionStateInteraction,
} from '../amazonq/commons/types'

import { Mode } from './constants'
import { DocMessenger } from './messenger'

export const cancelDocGenButton: ChatItemButton = {
    id: 'cancel-doc-generation',
    text: 'Cancel',
    icon: 'cancel' as MynahIcons,
}

export const inProgress = (progress: number, text: string): ProgressField => {
    return {
        status: 'default',
        text,
        value: progress === 100 ? -1 : progress,
        actions: [cancelDocGenButton],
    }
}

export interface SessionStateInteraction extends FeatureDevSessionStateInteraction {
    nextState: SessionState | Omit<SessionState, 'uploadId'> | undefined
    interaction: Interaction
}

export interface SessionState extends FeatureDevSessionState {
    interact(action: SessionStateAction): Promise<SessionStateInteraction>
}

export interface SessionStateAction extends FeatureDevSessionStateAction {
    messenger: DocMessenger
    mode: Mode
    folderPath?: string
}

export {
    LLMResponseType,
    SessionStorage,
    SessionInfo,
    DeletedFileInfo,
    NewFileInfo,
    NewFileZipContents,
    SessionStateConfig,
    SessionStatePhase,
    DevPhase,
    Interaction,
    CodeGenerationStatus,
    CurrentWsFolders,
}
