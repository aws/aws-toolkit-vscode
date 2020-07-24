// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.jetbrains.rider.test.base.PrepareTestEnvironment
import java.io.File

val dotNetSdk by lazy {
    val output = ExecUtil.execAndGetOutput(GeneralCommandLine("dotnet", "--version"))
    if (output.exitCode == 0) {
        "C:\\Program Files\\dotnet\\sdk\\${output.stdout.trim()}".also {
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
    VfsRootAccess.allowRootAccess(ApplicationManager.getApplication(),
        dotNetSdk,
        File(PrepareTestEnvironment.dotnetCoreCliPath).parentFile.absolutePath
    )
}
