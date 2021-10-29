// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.util.system.CpuArch

fun isArm64() = CpuArch.isArm64()
fun isIntel64() = SystemInfo.isIntel64()
