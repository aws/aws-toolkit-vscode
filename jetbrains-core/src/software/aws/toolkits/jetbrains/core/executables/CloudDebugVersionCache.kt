// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.util.text.SemVer
import com.intellij.util.text.nullize
import software.aws.toolkits.jetbrains.utils.FileInfoCache
import software.aws.toolkits.resources.message

object CloudDebugVersionCache : FileInfoCache<SemVer>() {
    override fun getFileInfo(path: String): SemVer {
        val executableName = "cloud-debug"
        val sanitizedPath = path.nullize(true)
            ?: throw RuntimeException(message("executableCommon.cli_not_configured", executableName))
        val commandLine = ExecutableCommon.getCommandLine(
            sanitizedPath,
            executableName
        ).withParameters("version")
        val process = CapturingProcessHandler(commandLine).runProcess()

        if (process.exitCode != 0) {
            val output = process.stderr.trimEnd()
            throw IllegalStateException(output)
        } else {
            val output: String = process.stdout.trimEnd()
            if (output.isEmpty()) {
                throw IllegalStateException(message("executableCommon.empty_info", executableName))
            }
            return SemVer.parseFromText(output)
                ?: throw IllegalStateException(message("executableCommon.version_parse_error",
                    executableName,
                    output
                ))
        }
    }
}
