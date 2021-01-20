// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.validOrNull
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import java.io.IOException

object DotNetRuntimeUtils {

    private val logger = getLogger<DotNetRuntimeUtils>()

    val defaultDotNetCoreRuntime: Runtime = Runtime.DOTNETCORE2_1

    /**
     * Get information about current .NET runtime
     *
     * @return the [software.amazon.awssdk.services.lambda.model.Runtime] instance of current available runtime or
     *         defaultDotnetCoreRuntime value if not defined.
     */
    fun getCurrentDotNetCoreRuntime(): Runtime {
        val runtimeList = try {
            java.lang.Runtime.getRuntime().exec("dotnet --list-runtimes").inputStream.bufferedReader().readLines()
        } catch (e: IOException) {
            logger.warn { "Error getting current runtime version: $e" }
            return defaultDotNetCoreRuntime
        }

        val versionRegex = Regex("(\\d+.\\d+.\\d+)")
        val versions = runtimeList
            .filter { it.startsWith("Microsoft.NETCore.App") }
            .map { runtimeString ->
                val match = versionRegex.find(runtimeString) ?: return@map null
                match.groups[1]?.value ?: return@map null
            }
            .filterNotNull()

        val version = versions.maxBy { it } ?: return defaultDotNetCoreRuntime

        return Runtime.fromValue("dotnetcore${version.split('.').take(2).joinToString(".")}").validOrNull
            ?: defaultDotNetCoreRuntime
    }

    const val RUNTIME_CONFIG_JSON_21 =
        """{
  "runtimeOptions": {
    "tfm": "netcoreapp2.1",
    "framework": {
      "name": "Microsoft.NETCore.App",
      "version": "2.1.0"
    },
    "rollForward": "Major"
  }
}"""
}
