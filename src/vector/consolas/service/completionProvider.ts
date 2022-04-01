/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConsolasConstants } from '../models/constants'
import { recommendations } from '../models/model'

export async function getCompletionItems() {
    const completionItems: string[] = []
    recommendations.response.forEach(async (recommendation, index) => {
        if (recommendation.content.length > 0) {
            completionItems.push(recommendation.content)
        }
    })
    return completionItems
}

export function getLabel(recommendation: string): string {
    return recommendation.slice(0, ConsolasConstants.LABEL_LENGTH) + '..'
}
