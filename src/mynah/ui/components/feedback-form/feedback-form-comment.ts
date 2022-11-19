/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'

export interface FeedbackFormCommentProps {
    onChange?: (comment: string) => void
    initComment?: string
}
export class FeedbackFormComment {
    render: ExtendedHTMLElement

    constructor(props: FeedbackFormCommentProps) {
        this.render = window.domBuilder.build({
            type: 'textarea',
            events: {
                keyup: (e: InputEvent) => {
                    if (props.onChange !== undefined) {
                        props.onChange(this.render.value)
                    }
                },
            },
            classNames: ['mynah-feedback-form-comment'],
            attributes: {
                ...(props.initComment !== undefined && props.initComment.length > 0 ? {} : { disabled: 'disabled' }),
                value: props.initComment ?? '',
                placeholder: 'How was your search?',
            },
        })
    }

    setEnabled = (enabled: boolean): void => {
        if (enabled) {
            this.render.removeAttribute('disabled')
            this.render.focus()
        } else {
            this.render.setAttribute('disabled', 'disabled')
        }
    }

    setComment = (comment: string): void => {
        this.render.value = comment
    }
}
