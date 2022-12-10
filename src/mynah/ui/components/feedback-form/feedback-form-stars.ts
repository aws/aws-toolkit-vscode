/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import { Icon, MynahIcons } from '../icon'
import { FeedbackStars } from './feedback-form'

export interface FeedbackFormStarsProps {
    onChange?: (star: FeedbackStars) => void
    initStar?: FeedbackStars
}
export class FeedbackFormStars {
    render: ExtendedHTMLElement

    constructor(props: FeedbackFormStarsProps) {
        this.render = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-feedback-form-stars-container'],
            attributes: { ...(props.initStar !== undefined && { 'selected-star': props.initStar.toString() }) },
            children: Array(5)
                .fill(undefined)
                .map((n, index) =>
                    window.domBuilder.build({
                        type: 'div',
                        classNames: ['mynah-feedback-form-star'],
                        events: {
                            click: (e: MouseEvent) => {
                                ;(this.render.querySelector('.selected') as ExtendedHTMLElement)?.removeClass(
                                    'selected'
                                )
                                ;(e.currentTarget as ExtendedHTMLElement).addClass('selected')
                                if (props.onChange !== undefined) {
                                    props.onChange((index + 1) as FeedbackStars)
                                }
                                this.setStar((index + 1) as FeedbackStars)
                            },
                        },
                        attributes: { star: (index + 1).toString() },
                        children: [new Icon({ icon: MynahIcons.STAR }).render],
                    })
                ),
        })
    }

    setStar = (star: FeedbackStars): void => {
        this.render.setAttribute('selected-star', star.toString())
    }
}
