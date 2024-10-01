/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncLock from 'async-lock'
import { globals } from '../../shared'
import { telemetry } from '../../shared/telemetry'
import { Event, uiEventRecorder } from '../util/eventRecorder'
import { CWCTelemetryHelper } from '../../codewhispererChat/controllers/chat/telemetryHelper'

export class AmazonQChatMessageDuration {
    private static _asyncLock = new AsyncLock()
    private static getAsyncLock() {
        if (!AmazonQChatMessageDuration._asyncLock) {
            AmazonQChatMessageDuration._asyncLock = new AsyncLock()
        }
        return AmazonQChatMessageDuration._asyncLock
    }

    /**
     * Record the initial requests in the chat message flow
     */
    static startChatMessageTelemetry(msg: { traceId: string; startTime: number; tabID: string; trigger?: string }) {
        const { traceId, startTime, tabID, trigger } = msg

        uiEventRecorder.set(tabID, {
            traceId,
            events: {
                chatMessageSent: startTime,
                editorReceivedMessage: globals.clock.Date.now(),
            },
        })
        if (trigger) {
            uiEventRecorder.set(tabID, {
                trigger,
            })
        }
    }

    /**
     * Stop listening to all incoming events and emit what we've found
     */
    static stopChatMessageTelemetry(msg: { tabID: string }) {
        const { tabID } = msg
        // We can't figure out what trace this event was associated with
        if (!tabID) {
            return
        }

        // Lock the tab id just in case another event tries to trigger this
        void AmazonQChatMessageDuration.getAsyncLock().acquire(tabID, () => {
            const metrics = uiEventRecorder.get(tabID)
            if (!metrics) {
                return
            }

            uiEventRecorder.set(tabID, {
                events: {
                    messageDisplayed: globals.clock.Date.now(),
                },
            })

            // get events sorted by the time they were created
            const events = Object.entries(metrics.events)
                .map((x) => ({
                    event: x[0],
                    duration: x[1],
                }))
                .sort((a, b) => {
                    return a.duration - b.duration
                })

            // Get the total duration by subtracting when the message was displayed and when the chat message was first sent
            const totalDuration = events[events.length - 1].duration - events[0].duration

            function durationFrom(start: Event, end: Event) {
                const startEvent = metrics.events[start]
                const endEvent = metrics.events[end]
                if (!startEvent || !endEvent) {
                    return -1
                }
                return endEvent - startEvent
            }

            telemetry.amazonq_chatRoundTrip.emit({
                amazonqChatMessageSentTime: metrics.events.chatMessageSent ?? -1,
                amazonqEditorReceivedMessageMs: durationFrom('chatMessageSent', 'editorReceivedMessage') ?? -1,
                amazonqFeatureReceivedMessageMs: durationFrom('editorReceivedMessage', 'featureReceivedMessage') ?? -1,
                amazonqMessageDisplayedMs: durationFrom('featureReceivedMessage', 'messageDisplayed') ?? -1,
                source: metrics.trigger,
                duration: totalDuration,
                result: 'Succeeded',
                traceId: metrics.traceId,
            })
            CWCTelemetryHelper.instance.emitAddMessage(tabID, totalDuration, metrics.events.chatMessageSent)

            uiEventRecorder.delete(tabID)
        })
    }
}
