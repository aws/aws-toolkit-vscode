/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import { OnCopiedToClipboardFunctionWithSuggestionId, Suggestion } from '../../helper/static'
import { Icon, MynahIcons } from '../icon'
import { SuggestionCardBody } from './suggestion-card-body'
import { SuggestionCardContextWrapper } from './suggestion-card-context-wrapper'
import { SuggestionCardHeader } from './suggestion-card-header'

/**
 * We'll not consider it as an engagement if the total spend time is lower than below constant and won't trigger the event
 */
const ENGAGEMENT_DURATION_LIMIT = 3000

/**
 * This 6(px) and 300(ms) are coming from a behavioral research and browser reaction to input devices to count the action as a mouse movement or a click event
 */
const ENGAGEMENT_MIN_SELECTION_DISTANCE = 6
const ENGAGEMENT_MIN_CLICK_DURATION = 300

/**
 * 'interaction' will be set if there was a potential text selection or a click input was triggered by the user.
 *  If this is a selection selectionDistanceTraveled object will also be filled
 * 'timespend' will be set basically if there is no interaction except mouse movements in a time spent longer than the ENGAGEMENT_DURATION_LIMIT
 *  Don't forget that in 'timespend' case, user should leave the suggestion card at some point to count it as an interaction.
 *  (They need to go back to the code or move to another card instead)
 */
export enum EngagementType {
    INTERACTION = 'interaction',
    TIME = 'timespend',
}
export interface SuggestionEngagement {
    /**
     * Suggestion information
     */
    suggestion: Suggestion

    /**
     * Engagement type
     */
    engagementType: EngagementType
    /**
     * Total duration in ms till the engagement triggered.
     */
    engagementDurationTillTrigger: number
    /**
     * This is a little bit more than what you might expect on a normal scroll position of the suggestion card.
     * This attribute gives the value for how much the users traveled their mouses and additionally how much they scrolled to focus on that suggestion
     */
    scrollDistanceToEngage: number
    /**
     * Total mouse movement in x and y directions till the engagament triggered.
     * To avoid confusion: this is not the distance between start and end points, this is the total traveled distance.
     */
    totalMouseDistanceTraveled: { x: number; y: number }
    /**
     * If the engagementType is "interaction" and this object has a value, you can assume it as a text selection.
     * If the engagementType is "interaction" but this object is not defined, you can assume it as a click
     */
    selectionDistanceTraveled?: { x: number; y: number; selectedText?: string }
}

export interface SuggestionCardProps {
    suggestion: Suggestion
    onSuggestionOpen?: (suggestion: Suggestion) => void
    onSuggestionLinkClick?: (suggestion: Suggestion) => void
    onSuggestionLinkCopy?: (suggestion: Suggestion) => void
    onSuggestionEngaged?: (engagementInfo: SuggestionEngagement) => void
    onCopiedToClipboard?: OnCopiedToClipboardFunctionWithSuggestionId
}
export class SuggestionCard {
    private engagementStartTime: number = -1
    private totalMouseDistanceTraveled: { x: number; y: number } = { x: 0, y: 0 }
    private previousMousePosition!: { x: number; y: number }
    private mouseDownInfo!: { x: number; y: number; time: number }
    private readonly onSuggestionEngaged
    private readonly suggestion: Suggestion
    render: ExtendedHTMLElement
    constructor(props: SuggestionCardProps) {
        this.suggestion = props.suggestion
        this.onSuggestionEngaged = props.onSuggestionEngaged
        this.render = window.domBuilder.build({
            type: 'div',
            attributes: {
                'data-filter': props.suggestion.context.map(context => `${context}, `).join(''),
            },
            classNames: ['mynah-card'],
            events:
                props.onSuggestionEngaged !== undefined
                    ? {
                          mouseenter: e => {
                              if (this.engagementStartTime === -1) {
                                  this.engagementStartTime = new Date().getTime()
                                  this.previousMousePosition = { x: e.clientX, y: e.clientY }
                                  this.totalMouseDistanceTraveled = { x: 0, y: 0 }
                              }
                          },
                          mousemove: e => {
                              this.totalMouseDistanceTraveled = {
                                  x:
                                      this.totalMouseDistanceTraveled.x +
                                      Math.abs(e.clientX - this.previousMousePosition.x),
                                  y:
                                      this.totalMouseDistanceTraveled.y +
                                      Math.abs(e.clientY - this.previousMousePosition.y),
                              }
                              this.previousMousePosition = { x: e.clientX, y: e.clientY }
                          },
                          mousedown: e => {
                              this.mouseDownInfo = { x: e.clientX, y: e.clientY, time: new Date().getTime() }
                          },
                          mouseup: e => {
                              const mouseUpInfo = { x: e.clientX, y: e.clientY, time: new Date().getTime() }
                              if (
                                  this.mouseDownInfo !== undefined && // in case of down is prevented defauly by some listener
                                  (Math.abs(this.mouseDownInfo.x - mouseUpInfo.x) > ENGAGEMENT_MIN_SELECTION_DISTANCE ||
                                      Math.abs(this.mouseDownInfo.y - mouseUpInfo.y) >
                                          ENGAGEMENT_MIN_SELECTION_DISTANCE) &&
                                  mouseUpInfo.time - this.mouseDownInfo.time > ENGAGEMENT_MIN_CLICK_DURATION
                              ) {
                                  this.handleEngagement({
                                      x: Math.abs(this.mouseDownInfo.x - mouseUpInfo.x),
                                      y: Math.abs(this.mouseDownInfo.y - mouseUpInfo.y),
                                      selectedText: window?.getSelection()?.toString(),
                                  })
                              } else {
                                  this.handleEngagement({ x: 0, y: 0 })
                              }
                          },
                          mouseleave: () => {
                              const engagementEndTime = new Date().getTime()
                              if (engagementEndTime - this.engagementStartTime > ENGAGEMENT_DURATION_LIMIT) {
                                  this.handleEngagement()
                              } else {
                                  this.resetEngagement()
                              }
                          },
                      }
                    : {},
            children: [
                {
                    type: 'div',
                    classNames: ['mynah-suggestion-from-history-icon'],
                    children: [new Icon({ icon: MynahIcons.SEARCH_HISTORY }).render],
                },
                new SuggestionCardHeader({
                    title: props.suggestion.title,
                    url: props.suggestion.url,
                    onSuggestionTitleClick: () => {
                        if (props.onSuggestionOpen !== undefined) {
                            props.onSuggestionOpen(props.suggestion)
                        }
                    },
                    onSuggestionLinkClick: () => {
                        if (props.onSuggestionLinkClick !== undefined) {
                            props.onSuggestionLinkClick(props.suggestion)
                        }
                    },
                    onSuggestionLinkCopy: () => {
                        if (props.onSuggestionLinkCopy !== undefined) {
                            props.onSuggestionLinkCopy(props.suggestion)
                        }
                    },
                }).render,
                new SuggestionCardContextWrapper({ contextList: props.suggestion.context }).render,
                new SuggestionCardBody({
                    suggestion: props.suggestion,
                    onCopiedToClipboard: (type, selection) => {
                        if (props.onCopiedToClipboard !== undefined) {
                            props.onCopiedToClipboard(props.suggestion.url, type, selection)
                        }
                    },
                }).render,
            ],
        })
    }

    private readonly resetEngagement = (): void => {
        this.engagementStartTime = -1
        this.totalMouseDistanceTraveled = { x: 0, y: 0 }
        this.previousMousePosition = { x: 0, y: 0 }
        this.mouseDownInfo = { x: 0, y: 0, time: -1 }
    }

    private readonly handleEngagement = (interactionDistanceTraveled?: {
        x: number
        y: number
        selectedText?: string
    }): void => {
        if (this.engagementStartTime !== -1 && this.onSuggestionEngaged !== undefined) {
            this.onSuggestionEngaged({
                suggestion: this.suggestion,
                engagementDurationTillTrigger: new Date().getTime() - this.engagementStartTime,
                scrollDistanceToEngage:
                    this.render.offsetTop - this.previousMousePosition.y > 0
                        ? this.render.offsetTop - this.previousMousePosition.y
                        : 0,
                engagementType:
                    interactionDistanceTraveled !== undefined ? EngagementType.INTERACTION : EngagementType.TIME,
                totalMouseDistanceTraveled: this.totalMouseDistanceTraveled,
                selectionDistanceTraveled:
                    Boolean(interactionDistanceTraveled?.x ?? 0) && Boolean(interactionDistanceTraveled?.y)
                        ? interactionDistanceTraveled
                        : undefined,
            })
            this.resetEngagement()
        }
    }
}
