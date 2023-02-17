// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.util.text.SemVer
import com.intellij.util.text.nullize
import software.aws.toolkits.jetbrains.core.executables.ExecutableCommon
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.utils.FileInfoCache
import software.aws.toolkits.resources.message

object SamVersionCache : FileInfoCache<SemVer>() {
    override fun getFileInfo(path: String): SemVer {
        val executableName = "sam"
        val sanitizedPath = path.nullize(true) ?: throw RuntimeException(message("executableCommon.cli_not_configured", executableName))
        val commandLine = ExecutableCommon.getCommandLine(sanitizedPath, executableName, ExecutableType.getInstance<SamExecutable>()).withParameters("--info")
        val process = CapturingProcessHandler(commandLine).runProcess()

        if (process.exitCode != 0) {
            val output = process.stderr.trimEnd()
            if (output.contains(SamCommon.SAM_INVALID_OPTION_SUBSTRING)) {
                throw IllegalStateException(message("executableCommon.unexpected_output", SamCommon.SAM_NAME, output))
            }
            throw IllegalStateException(output)
        } else {
            val output = process.stdout.trimEnd()
            if (output.isEmpty()) {
                throw IllegalStateException(message("executableCommon.empty_info", SamCommon.SAM_NAME))
            }
            val tree = SamCommon.mapper.readTree(output)
            val version = tree.get(SamCommon.SAM_INFO_VERSION_KEY).asText()
            return SemVer.parseFromText(version) ?: throw IllegalStateException(message("executableCommon.version_parse_error", SamCommon.SAM_NAME, version))
        }
    }
}
