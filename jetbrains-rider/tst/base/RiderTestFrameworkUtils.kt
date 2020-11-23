// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.jetbrains.rider.test.base.PrepareTestEnvironment
import java.io.File

/**
 * Force us to use 3.1. 2020.1 does not like running against 5.
 * Format is:
 * ```
 * 2.1.811 [C:\Program Files\dotnet\sdk]
 * 3.1.404 [C:\Program Files\dotnet\sdk]
 * 5.0.100 [C:\Program Files\dotnet\sdk]
 * ```
 *
 * TODO: This seems like it is not needed with 2020.2+ so look to remove it FIX_WHEN_MIN_IS_202
 */
val dotNetSdk by lazy {
    val output = ExecUtil.execAndGetOutput(GeneralCommandLine("dotnet", "--list-sdks"))
    if (output.exitCode == 0) {
        // We use version 3.1 due to 2020.1 does not like 5, FIX_WHEN_MIN_IS_202
        val versions = output.stdoutLines.map { it.split(" ").first() }
        val v31 = versions.first { it.startsWith("3.1") }
        "C:\\Program Files\\dotnet\\sdk\\$v31".also {
            println("Using dotnet SDK at $it")
        }
    } else {
        throw IllegalStateException("Failed to locate dotnet version: ${output.stderr}")
    }
}

val msBuild by lazy {
    "${dotNetSdk}\\MSBuild.dll"
}

// TODO: Remove when https://youtrack.jetbrains.com/issue/RIDER-47995 is fixed FIX_WHEN_MIN_IS_203
fun allowCustomDotnetRoots() {
    // Rider Test Framework miss VFS root access for the case when running tests on local environment with custom SDK path
    // This should be fixed on Rider Test Framework level. Workaround it until related ticket RIDER-47995 is fixed.
    VfsRootAccess.allowRootAccess(
        ApplicationManager.getApplication(),
        dotNetSdk,
        File(PrepareTestEnvironment.dotnetCoreCliPath).parentFile.absolutePath
    )
}
