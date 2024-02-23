// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.util.text.SemVer
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread

fun LambdaRuntime.minSamDebuggingVersion(): SemVer =
    minSamDebugging?.let { SemVer.parseFromText(it) ?: throw IllegalStateException("$this has bad minSamDebuggingVersion! It should be a semver string!") }
        ?: SamExecutable.minVersion

fun LambdaRuntime.minSamInitVersion(): SemVer =
    minSamInit?.let { SemVer.parseFromText(it) ?: throw IllegalStateException("$this has bad minSamInitVersion! It should be a semver string!") }
        ?: SamExecutable.minVersion

fun LambdaArchitecture.minSamVersion(): SemVer =
    minSam?.let { SemVer.parseFromText(it) ?: throw IllegalStateException("$this has bad minSamInitVersion! It should be a semver string!") }
        ?: SamExecutable.minVersion

fun LambdaClient.waitForUpdatableState(functionName: String) {
    assertIsNonDispatchThread()
    // wait until function is both active and not being updated
    waiter().waitUntilFunctionActive { it.functionName(functionName) }
    waiter().waitUntilFunctionUpdated { it.functionName(functionName) }
}
