/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable, Logger } from '../../shared/logger'

// TODO : Consolidate all Test Loggers in a separate change
export class FakeLogger implements Logger {
    public readonly debugEntries: Loggable[] = []
    public readonly verboseEntries: Loggable[] = []
    public readonly infoEntries: Loggable[] = []
    public readonly warnEntries: Loggable[] = []
    public readonly errorEntries: Loggable[] = []

    public debug(...message: Loggable[]): void {
        this.debugEntries.push(...message)
    }

    public verbose(...message: Loggable[]): void {
        this.verboseEntries.push(...message)
    }

    public info(...message: Loggable[]): void {
        this.infoEntries.push(...message)
    }

    public warn(...message: Loggable[]): void {
        this.warnEntries.push(...message)
    }

    public error(...message: Loggable[]): void {
        this.errorEntries.push(...message)
    }
}
