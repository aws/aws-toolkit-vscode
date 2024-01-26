/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ChatItem } from '@aws/mynah-ui'

/**
 * Verify that the text items in expectedText appears in the exact same order in chatItems
 * @param chatItems An array of chat items in mynah UI
 * @param expectedText An array of expected text items in order
 * @returns true if the items in expectedText are found in the correct order in chatItems otherwise false
 */
export function verifyTextOrder(chatItems: ChatItem[], expectedText: string[]) {
    let currInd = 0
    for (const item of chatItems) {
        if (item.body?.includes(expectedText[currInd])) {
            currInd++
        }
    }

    if (currInd !== expectedText.length) {
        assert.fail('Items did not appear in expected order')
    }
}
