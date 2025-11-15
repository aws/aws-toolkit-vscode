/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fromExtensionManifest } from '../../shared/settings'

export const ExtensionId = 'amazonwebservices.cloudformation'
export const ExtensionName = 'AWS CloudFormation'
export const Version = '1.0.0'
export const ExtensionConfigKey = 'aws.cloudformation'

export class CloudFormationTelemetrySettings extends fromExtensionManifest(`${ExtensionConfigKey}.telemetry`, {
    enabled: Boolean,
}) {}
