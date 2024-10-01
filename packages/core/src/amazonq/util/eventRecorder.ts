/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RecordMap } from '../../shared/utilities/map'

export type Event =
    | 'chatMessageSent' // initial on chat prompt event in the ui
    | 'editorReceivedMessage' // message gets from the chat prompt to VSCode
    | 'featureReceivedMessage' // message gets redirected from VSCode -> Partner team features implementation
    | 'messageDisplayed' // message gets received in the UI

/**
 * For a given traceID, map an event to a time
 *
 * This is used to correlated disjoint events that are happening in different
 * parts of Q Chat.
 *
 * It allows us to tracks time intervals between key events:
 *  - when VSCode received the message
 *  - when the feature starts processing the message
 *  - final message rendering
 * and emit those as a final result, rather than having to emit each event individually
 */
export const uiEventRecorder = new RecordMap<{
    trigger: string
    events: Partial<Record<Event, number>>
}>()
