/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnboardingPageInteraction } from '../../amazonq/onboardingPage/model'
import { EditorContextCommand } from '../commands/registerCommands'
import { EditorContext } from '../editor/context/model'

export type TriggerEventType =
    | 'chat_message'
    | 'editor_context_command'
    | 'follow_up'
    | 'onboarding_page_interaction'
    | 'quick_action'

export interface TriggerEvent {
    readonly id: string
    tabID: string | undefined
    readonly context: EditorContext | undefined
    readonly message: string | undefined
    readonly type: TriggerEventType
    readonly command?: EditorContextCommand
    readonly quickAction?: string
    readonly onboardingPageInteraction?: OnboardingPageInteraction
}

export class TriggerEventsStorage {
    private triggerEvents: Map<string, TriggerEvent> = new Map()
    private triggerEventsByTabID: Map<string, TriggerEvent[]> = new Map()

    public removeTabEvents(tabID: string) {
        const events = this.triggerEventsByTabID.get(tabID) ?? []
        events.forEach((event: TriggerEvent) => {
            this.triggerEvents.delete(event.id)
        })

        this.triggerEventsByTabID.delete(tabID)
    }

    public getLastTriggerEventByTabID(tabID: string): TriggerEvent | undefined {
        const events = this.triggerEventsByTabID.get(tabID) ?? []

        if (events.length === 0) {
            return undefined
        }

        return events[events.length - 1]
    }

    private pushEventToTriggerEventsByTabID(event: TriggerEvent) {
        if (event.tabID === undefined) {
            return
        }
        const currentEventsList = this.triggerEventsByTabID.get(event.tabID) ?? []
        currentEventsList.push(event)
        this.triggerEventsByTabID.set(event.tabID, currentEventsList)
    }

    public addTriggerEvent(event: TriggerEvent) {
        this.triggerEvents.set(event.id, event)
        this.pushEventToTriggerEventsByTabID(event)
    }

    public removeTriggerEvent(id: string) {
        this.triggerEvents.delete(id)
    }

    public updateTriggerEventTabIDFromUnknown(id: string, tabID: string) {
        const currentTriggerEvent = this.triggerEvents.get(id)

        if (currentTriggerEvent === undefined || currentTriggerEvent.tabID !== undefined) {
            return
        }

        currentTriggerEvent.tabID = tabID

        this.triggerEvents.set(id, currentTriggerEvent)
        this.pushEventToTriggerEventsByTabID(currentTriggerEvent)
    }

    public getTriggerEvent(id: string): TriggerEvent | undefined {
        return this.triggerEvents.get(id)
    }

    public getTriggerEventsByTabID(tabID: string): TriggerEvent[] {
        return this.triggerEventsByTabID.get(tabID) ?? []
    }
}
