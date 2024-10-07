/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncLock from 'async-lock'
import { globals } from '../../shared'
import { telemetry } from '../../shared/telemetry'
import { Event, uiEventRecorder } from '../util/eventRecorder'
import { CWCTelemetryHelper } from '../../codewhispererChat/controllers/chat/telemetryHelper'
import { TabType } from '../webview/ui/storages/tabsStorage'

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
        CWCTelemetryHelper.instance.setDisplayTimeForChunks(tabID, startTime)
    }

    /**
     * Stop listening to all incoming events and emit what we've found
     */
    static stopChatMessageTelemetry(msg: { tabID: string; time: number; tabType: TabType }) {
        const { tabID, time, tabType } = msg

        // We can't figure out what trace this event was associated with
        if (!tabID || tabType !== 'cwc') {
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
                    messageDisplayed: time,
                },
            })

            const displayTime = metrics.events.messageDisplayed
            const sentTime = metrics.events.chatMessageSent
            if (!displayTime || !sentTime) {
                return
            }

            const totalDuration = displayTime - sentTime

            function durationFrom(start: Event, end: Event) {
                const startEvent = metrics.events[start]
                const endEvent = metrics.events[end]
                if (!startEvent || !endEvent) {
                    return -1
                }
                return endEvent - startEvent
            }

            // TODO: handle onContextCommand round trip time
            if (metrics.trigger !== 'onContextCommand') {
                telemetry.amazonq_chatRoundTrip.emit({
                    amazonqChatMessageSentTime: metrics.events.chatMessageSent ?? -1,
                    amazonqEditorReceivedMessageMs: durationFrom('chatMessageSent', 'editorReceivedMessage') ?? -1,
                    amazonqFeatureReceivedMessageMs:
                        durationFrom('editorReceivedMessage', 'featureReceivedMessage') ?? -1,
                    amazonqMessageDisplayedMs: durationFrom('featureReceivedMessage', 'messageDisplayed') ?? -1,
                    source: metrics.trigger,
                    duration: totalDuration,
                    result: 'Succeeded',
                    traceId: metrics.traceId,
                })
            }

            CWCTelemetryHelper.instance.emitAddMessage(tabID, totalDuration, metrics.events.chatMessageSent)

            uiEventRecorder.delete(tabID)
        })
    }

    static updateChatMessageTelemetry(msg: { tabID: string; time: number; tabType: TabType }) {
        const { tabID, time, tabType } = msg
        if (!tabID || tabType !== 'cwc') {
            return
        }

        CWCTelemetryHelper.instance.setDisplayTimeForChunks(tabID, time)
    }
}
