/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { globals } from '../../shared'
import { telemetry } from '../../shared/telemetry'
import { Event, uiEventRecorder } from '../util/eventRecorder'

export class AmazonQChatMessageDuration {
    /**
     * Record the initial requests in the chat message flow
     */
    static startChatMessageTelemetry(msg: { traceId: string; startTime: number; trigger?: string }) {
        const { traceId, startTime, trigger } = msg

        uiEventRecorder.set(traceId, {
            events: {
                chatMessageSent: startTime,
            },
        })
        uiEventRecorder.set(traceId, {
            events: {
                editorReceivedMessage: globals.clock.Date.now(),
            },
        })
        if (trigger) {
            uiEventRecorder.set(traceId, {
                trigger,
            })
        }
    }

    /**
     * Stop listening to all incoming events and emit what we've found
     */
    static stopChatMessageTelemetry(msg: { traceId: string }) {
        const { traceId } = msg

        // We can't figure out what trace this event was associated with
        if (!traceId) {
            return
        }

        uiEventRecorder.set(traceId, {
            events: {
                messageDisplayed: globals.clock.Date.now(),
            },
        })

        const metrics = uiEventRecorder.get(traceId)

        // get events sorted by the time they were created
        const events = Object.entries(metrics.events)
            .map((x) => ({
                event: x[0],
                duration: x[1],
            }))
            .sort((a, b) => {
                return a.duration - b.duration
            })

        const chatMessageSentTime = events[events.length - 1].duration
        // Get the total duration by subtracting when the message was displayed and when the chat message was first sent
        const totalDuration = events[events.length - 1].duration - events[0].duration

        /**
         * Find the time it took to get between two metric events
         */
        const timings = new Map<Event, number>()
        for (let i = 1; i < events.length; i++) {
            const currentEvent = events[i]
            const previousEvent = events[i - 1]

            const timeDifference = currentEvent.duration - previousEvent.duration

            timings.set(currentEvent.event as Event, timeDifference)
        }

        telemetry.amazonq_chatRoundTrip.emit({
            amazonqChatMessageSentTime: chatMessageSentTime,
            amazonqEditorReceivedMessageMs: timings.get('editorReceivedMessage') ?? -1,
            amazonqFeatureReceivedMessageMs: timings.get('featureReceivedMessage') ?? -1,
            amazonqMessageDisplayedMs: timings.get('messageDisplayed') ?? -1,
            source: metrics.trigger,
            duration: totalDuration,
            result: 'Succeeded',
            traceId,
        })

        uiEventRecorder.delete(traceId)
    }
}
