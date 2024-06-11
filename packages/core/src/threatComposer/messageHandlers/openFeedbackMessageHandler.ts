/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { submitFeedback } from '../../feedback/vue/submitFeedback'
import { placeholder } from '../../shared/vscode/commands2'

/**
 * Handler for opening the feedback message.
 * This function is responsible for submitting the feedback message
 * to the feedback service.
 * @returns {Promise<void>} A promise that resolves when the feedback message has been submitted.
 */
export function openFeedbackMessageHandler() {
    void submitFeedback(placeholder, 'Threat Composer')
}
