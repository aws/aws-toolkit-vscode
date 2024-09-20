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
 */
export const uiEventRecorder = new RecordMap<{
    trigger: string
    events: Partial<Record<Event, number>>
}>()
