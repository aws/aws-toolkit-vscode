/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * To keep dependencies in ./logger.ts to a minimum we create this logger in a separate file.
 */

import globals from '../extensionGlobals'
import { getLogger } from './logger'

export class PerfLog {
    private readonly log
    public readonly start

    public constructor(public readonly topic: string) {
        const log = getLogger()
        this.log = log
        this.start = globals.clock.Date.now()
    }

    public elapsed(): number {
        return globals.clock.Date.now() - this.start
    }

    public done(): void {
        if (!this.log.logLevelEnabled('verbose')) {
            return
        }
        const elapsed = this.elapsed()
        this.log.verbose('%s took %dms', this.topic, elapsed.toFixed(1))
    }
}
