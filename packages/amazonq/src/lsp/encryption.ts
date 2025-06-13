/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as jose from 'jose'

export async function encryptRequest<T>(params: T, encryptionKey: Buffer): Promise<{ message: string } | T> {
    const payload = new TextEncoder().encode(JSON.stringify(params))

    const encryptedMessage = await new jose.CompactEncrypt(payload)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(encryptionKey)

    return { message: encryptedMessage }
}

export async function decryptResponse<T>(response: unknown, key: Buffer | undefined) {
    // Note that casts are required since language client requests return 'unknown' type.
    // If we can't decrypt, return original response casted.
    if (typeof response !== 'string' || key === undefined) {
        return response as T
    }

    const result = await jose.jwtDecrypt(response, key, {
        clockTolerance: 60, // Allow up to 60 seconds to account for clock differences
        contentEncryptionAlgorithms: ['A256GCM'],
        keyManagementAlgorithms: ['dir'],
    })

    if (!result.payload) {
        throw new Error('JWT payload not found')
    }
    return result.payload as T
}
