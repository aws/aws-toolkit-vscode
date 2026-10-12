/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'

/** Standard AMZ SigV4 header values used in URI handler tests. */
export const amzHeaderParams = {
    'X-Amz-Security-Token': 'fake/token+with=special',
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Date': '20240101T120000Z',
    'X-Amz-SignedHeaders': 'host',
    'X-Amz-Credential': 'AKIATEST/20240101/us-west-2/ssmmessages/aws4_request',
    'X-Amz-Expires': '60',
    'X-Amz-Signature': 'fakesignature123',
}

/**
 * Asserts that a WebSocket URL contains all expected AMZ header parameters
 * with correct percent-encoding.
 */
export function assertAmzHeadersInUrl(actualUrl: string, cellNumber: string) {
    assert.ok(actualUrl.includes(`cell-number=${cellNumber}`))
    assert.ok(actualUrl.includes('X-Amz-Security-Token=fake%2Ftoken%2Bwith%3Dspecial'))
    assert.ok(actualUrl.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'))
    assert.ok(actualUrl.includes('X-Amz-Date=20240101T120000Z'))
    assert.ok(actualUrl.includes('X-Amz-SignedHeaders=host'))
    assert.ok(actualUrl.includes('X-Amz-Credential=AKIATEST%2F20240101%2Fus-west-2%2Fssmmessages%2Faws4_request'))
    assert.ok(actualUrl.includes('X-Amz-Expires=60'))
    assert.ok(actualUrl.includes('X-Amz-Signature=fakesignature123'))
}
