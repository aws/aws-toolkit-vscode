/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { globals } from '..'

export class PollingSet<T> {
    public readonly pollingNodes: Set<T>
    public pollTimer?: NodeJS.Timeout

    public constructor(
        private readonly interval: number,
        private readonly action: () => void
    ) {
        this.pollingNodes = new Set<T>()
    }

    public add(id: T): void {
        this.pollingNodes.add(id)
    }

    public delete(id: T): void {
        this.pollingNodes.delete(id)
    }

    public size(): number {
        return this.pollingNodes.size
    }

    public isEmpty(): boolean {
        return this.pollingNodes.size == 0
    }

    public hasTimer(): boolean {
        return this.pollTimer != undefined
    }

    public clearTimer(): void {
        if (this.isEmpty() && this.hasTimer()) {
            globals.clock.clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }
    }

    public start(id: T): void {
        this.add(id)
        this.pollTimer =
            this.pollTimer ??
            globals.clock.setInterval(() => {
                this.action()
                if (this.isEmpty()) {
                    this.clearTimer()
                }
            }, this.interval)
    }
}
