/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ErrorOrString, Logger } from '../../shared/logger'

// TODO : Rename (FakeLogger) and consolidate all Test Loggers in a separate change
export class FakeBasicLogger implements Logger {
    public readonly debugEntries: ErrorOrString[] = []
    public readonly verboseEntries: ErrorOrString[] = []
    public readonly infoEntries: ErrorOrString[] = []
    public readonly warnEntries: ErrorOrString[] = []
    public readonly errorEntries: ErrorOrString[] = []

    public debug(...message: ErrorOrString[]): void {
        this.debugEntries.push(...message)
    }

    public verbose(...message: ErrorOrString[]): void {
        this.verboseEntries.push(...message)
    }

    public info(...message: ErrorOrString[]): void {
        this.infoEntries.push(...message)
    }

    public warn(...message: ErrorOrString[]): void {
        this.warnEntries.push(...message)
    }

    public error(...message: ErrorOrString[]): void {
        this.errorEntries.push(...message)
    }
}
