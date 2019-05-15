/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Unit } from './clienttelemetry'

export interface TelemetryName {
    namespace: TelemetryNamespace | OldTelemetryNamespace
    name: string
}

export interface Datum {
    name: string
    value: number
    unit?: Unit
    metadata?: Map<string, string>
}

type OldTelemetryNamespace = 'Command'

export enum TelemetryNamespace {
    Aws = 'aws',
    Cloudformation = 'cloudformation',
    Lambda = 'lambda',
    Project = 'project',
    Session = 'session'
}
