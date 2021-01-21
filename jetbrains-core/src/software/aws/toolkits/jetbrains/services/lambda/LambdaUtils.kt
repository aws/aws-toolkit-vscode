// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.util.text.SemVer
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable

fun LambdaRuntime.minSamDebuggingVersion(): SemVer =
    minSamDebugging?.let { SemVer.parseFromText(it) ?: throw IllegalStateException("$this has bad minSamDebuggingVersion! It should be a semver string!") }
        ?: SamExecutable.minVersion

fun LambdaRuntime.minSamInitVersion(): SemVer =
    minSamInit?.let { SemVer.parseFromText(it) ?: throw IllegalStateException("$this has bad minSamInitVersion! It should be a semver string!") }
        ?: SamExecutable.minVersion
