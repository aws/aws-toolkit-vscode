/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from './logger'

export class PerfLog {
    private readonly log
    public readonly start

    public constructor(public readonly topic: string) {
        const log = getLogger()
        this.log = log
        this.start = performance.now()
    }

    public elapsed(): number {
        return performance.now() - this.start
    }

    public done(): void {
        if (!this.log.logLevelEnabled('verbose')) {
            return
        }
        const elapsed = this.elapsed()
        this.log.verbose('%s took %dms', this.topic, elapsed.toFixed(1))
    }
}
