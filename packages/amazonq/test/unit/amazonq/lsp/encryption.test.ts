/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { decryptResponse, encryptRequest } from '../../../../src/lsp/encryption'
import { encryptionKey } from '../../../../src/lsp/client'

describe('LSP encryption', function () {
    it('encrypt and decrypt invert eachother with same key', async function () {
        const key = encryptionKey
        const request = {
            id: 0,
            name: 'my Request',
            isRealRequest: false,
            metadata: {
                tags: ['tag1', 'tag2'],
            },
        }
        const encryptedPayload = await encryptRequest<typeof request>(request, key)
        const message = (encryptedPayload as { message: string }).message
        const decrypted = await decryptResponse<typeof request>(message, key)

        assert.deepStrictEqual(decrypted, request)
    })
})
