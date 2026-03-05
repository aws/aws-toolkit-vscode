/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fromExtensionManifest } from '../../shared/settings'

export const ExtensionName = 'AWS CloudFormation'
export const ExtensionConfigKey = 'aws.cloudformation'
export const ExtensionId = ExtensionConfigKey

export class CloudFormationTelemetrySettings extends fromExtensionManifest(`${ExtensionConfigKey}.telemetry`, {
    enabled: Boolean,
}) {}
