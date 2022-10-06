/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export class Scheduler {
    private timer: any
    private actionPending: boolean

    constructor(
        private readonly action: () => unknown | Promise<unknown>,
        private readonly schedulingInterval: number
    ) {
        this.actionPending = false
    }

    start() {
        this.timer = setTimeout(async () => {
            try {
                this.actionPending = true
                await this.action()
            } catch (_err) {
                // No-op because we want to schedule another action irrespective of the outcome
                // of this action.
            } finally {
                this.actionPending = false
                if (this.timer) {
                    this.start()
                }
            }
        }, this.schedulingInterval)
    }

    async executeOnce() {
        if (this.actionPending) {
            return
        } else {
            this.stop()
            try {
                this.actionPending = true
                await this.action()
            } catch (_err) {
                // No-op because we'll start the scheduler irrespective of the outcome of this action
            } finally {
                this.actionPending = false
                this.start()
            }
        }
    }

    stop(): void {
        clearTimeout(this.timer)
        this.timer = undefined
    }
}
