/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple sequential write queue to prevent concurrent file writes.
 */
export class WriteQueue {
    private isWriting = false
    private queue: Array<() => Promise<void>> = []

    push(operation: () => Promise<void>) {
        this.queue.push(operation)
    }

    async process() {
        if (this.isWriting || this.queue.length === 0) {
            return
        }

        this.isWriting = true
        try {
            while (this.queue.length > 0) {
                const writeOperation = this.queue.shift()!
                await writeOperation()
            }
        } finally {
            this.isWriting = false
        }
    }
}
