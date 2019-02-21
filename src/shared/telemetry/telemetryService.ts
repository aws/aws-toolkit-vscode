/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TelemetryEvent } from './telemetryEvent'

export interface TelemetryService {
    telemetryEnabled: boolean
    persistFilePath: string

    start(): void
    shutdown(): Promise<any>
    record(event: TelemetryEvent): void
}
