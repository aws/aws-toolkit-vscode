/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TelemetryEvent } from './telemetryEvent'

// const NAME_ILLEGAL_CHARS_REGEX = new RegExp('[^\w+-.:]')

export interface TelemetryPublisher {
    enqueue(events: TelemetryEvent[]): any
    flush(): Promise<any>
}
