/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RecordMap } from '../../shared/utilities/map'

export type Event =
    | 'chatMessageSent' // initial on chat prompt event in the ui
    | 'editorReceivedMessage' // message gets from the chat prompt to VSCode
    | 'featureReceivedMessage' // message gets redirected from VSCode -> Partner team features implementation
    | 'messageDisplayed' // message gets shown in the UI

/**
 * For a given tabId, map an event to a time
 *
 * This is used to correlated disjoint events that are happening in different
 * parts of Q Chat.
 *
 * It allows us to tracks time intervals between key events:
 *  - when VSCode received the message
 *  - when the feature starts processing the message
 *  - final message rendering
 * and emit those as a final result, rather than having to emit each event individually
 *
 * Event timings are generated using Date.now() instead of performance.now() for cross-context consistency.
 * performance.now() provides timestamps relative to the context's time origin (when the webview or VS Code was opened),
 * which can lead to inconsistent measurements between the webview and vscode.
 * Date.now() is more consistent across both contexts
 */
export const uiEventRecorder = new RecordMap<{
    trigger: string
    traceId: string
    events: Partial<Record<Event, number>>
}>()
