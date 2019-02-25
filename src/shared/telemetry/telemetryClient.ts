/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TelemetryEvent } from './telemetryEvent'

export interface TelemetryClient {
    postMetrics(payload: TelemetryEvent[]): Promise<TelemetryEvent[] | undefined>
}
