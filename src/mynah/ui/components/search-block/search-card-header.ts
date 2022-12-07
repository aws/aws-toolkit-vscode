/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtendedHTMLElement } from '../../helper/dom'
import { FeedbackForm } from '../feedback-form/feedback-form'

export class SearchCardHeader {
    private feedbackForm: FeedbackForm
    render: ExtendedHTMLElement

    constructor() {
        this.feedbackForm = new FeedbackForm({ onFeedbackSet: window.serviceConnector.sendFeedback })

        this.render = window.domBuilder.build({
            type: 'div',
            persistent: true,
            classNames: ['mynah-search-block-header'],
            children: [this.feedbackForm.feedbackContainer],
        })
    }
}
