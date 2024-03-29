// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.application.ApplicationInfo

fun isQSupportedInThisVersion(): Boolean = ApplicationInfo.getInstance().build.asStringWithoutProductCode() !in unSupportedIdeVersionInQ

// FIX_WHEN_MIN_IS_233: https://youtrack.jetbrains.com/issue/JBR-5850
private val unSupportedIdeVersionInQ = listOf("232.8660.185")
