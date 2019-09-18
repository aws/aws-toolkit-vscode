// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

@Deprecated("TelemetryNamespace should not be used")
interface TelemetryNamespace {
    fun getNamespace(): String = javaClass.simpleName
}
