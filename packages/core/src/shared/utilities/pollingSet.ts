/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { globals } from '..'

/**
 * A useful abstraction that does the following:
 * - keep a set of items.
 * - if the set is non-empty, run some action every interval seconds.
 * - once the set empties, clear the timer
 * @param interval the interval in seconds
 * @param action the action to perform
 */
export class PollingSet<T> extends Set<T> {
    public pollTimer?: NodeJS.Timeout

    public constructor(
        private readonly interval: number,
        private readonly action: () => void
    ) {
        super()
    }

    public isActive(): boolean {
        return this.size !== 0
    }

    public hasTimer(): boolean {
        return this.pollTimer !== undefined
    }

    public clearTimer(): void {
        if (!this.isActive() && this.hasTimer()) {
            globals.clock.clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }
    }

    private poll() {
        this.action()
        if (!this.isActive()) {
            this.clearTimer()
        }
    }

    public start(id: T): void {
        this.add(id)
        this.pollTimer = this.pollTimer ?? globals.clock.setInterval(() => this.poll(), this.interval)
    }
}
