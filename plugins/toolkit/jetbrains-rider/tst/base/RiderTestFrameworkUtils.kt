// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.util.text.SemVer
import java.nio.file.Paths
import java.time.Duration

// sometimes Windows Rider tests time out while starting the backend
val backendStartTimeout = Duration.ofMinutes(3)

val versions by lazy {
    // would be nice if this were json https://github.com/dotnet/runtime/issues/3049
    val output = ExecUtil.execAndGetOutput(GeneralCommandLine("dotnet", "--list-sdks"))
    if (output.exitCode != 0) {
        throw IllegalStateException("Failed to locate dotnet version: ${output.stderr}")
    }

    output.stdout.trim().lines().map {
        val (version, path) = it.split(' ', limit = 2)
        val sdkSemVer = SemVer.parseFromText(version) ?: throw RuntimeException("Could not parse .NET SDK version as SemVar: $version")
        sdkSemVer to path.trim('[', ']')
    }.sortedByDescending { it.first }
}

val dotNetSdk by lazy {
    val version = ApplicationInfo.getInstance().build.baselineVersion

    val sdk = when {
        // FIX_WHEN_MIN_IS_212: Rider is not aware of .NET 6.0 until 212
        version < 212 ->
            versions.firstOrNull { it.first.major < 6 }
                ?: throw RuntimeException("Current IDE profile '$version' requires .NET < 6, but only found: $versions")
        // otherwise use latest
        else -> versions.first()
    }

    val (sdkVersion, sdkRoot) = sdk
    val sdkVersionFolder = sdkVersion.rawVersion
    val sdkPath = Paths.get(sdkRoot, sdkVersionFolder).toAbsolutePath().toString()

    println("Using .NET SDK '$sdkVersionFolder' at path: '$sdkPath'")

    return@lazy sdkPath
}

val msBuild by lazy {
    Paths.get(dotNetSdk, "MSBuild.dll").toAbsolutePath().toString()
}

// TODO: Remove when https://youtrack.jetbrains.com/issue/RIDER-47995 is fixed FIX_WHEN_MIN_IS_213
fun allowCustomDotnetRoots() {
    // Rider Test Framework miss VFS root access for the case when running tests on local environment with custom SDK path
    // This should be fixed on Rider Test Framework level. Workaround it until related ticket RIDER-47995 is fixed.
    VfsRootAccess.allowRootAccess(
        ApplicationManager.getApplication(),
        dotNetSdk,
    )
}
