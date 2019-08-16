/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

// TODO: Why is assert.rejects not found at runtime?
export async function assertRejects(action: () => Promise<any>) {
    let error: Error | undefined
    try {
        await action()
    } catch (err) {
        error = err as Error
    } finally {
        // Use assert.throws here instead of assert.ok(!!error) for a more appropriate error message.
        assert.throws(() => {
            if (!!error) {
                throw error
            }
        })
    }
}

export async function assertThrowsError(
    action: () => Promise<any>,
    message?: string | Error | undefined
): Promise<Error> {
    let error: Error | undefined
    try {
        await action()
    } catch (err) {
        assert.ok(err instanceof Error, 'caught error was not an instance of Error')
        error = err as Error
    } finally {
        // Test that an error was caught
        assert.throws(() => {
            if (!!error) {
                throw error
            }
        }, message)
    }

    return error!
}
