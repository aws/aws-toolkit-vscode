// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.application.ApplicationInfo
import java.time.Instant

fun calculateTotalLatency(startTime: Instant, endTime: Instant) = (endTime.toEpochMilli() - startTime.toEpochMilli()).toInt()

fun isIntellij(): Boolean {
    val productCode = ApplicationInfo.getInstance().build.productCode
    return productCode == "IC" || productCode == "IU"
}
