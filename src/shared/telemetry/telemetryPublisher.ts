/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryEvent } from './telemetryEvent'

export interface TelemetryPublisher {
    init(): Promise<void>

    enqueue(...events: TelemetryEvent[]): any
    flush(): Promise<any>
}
