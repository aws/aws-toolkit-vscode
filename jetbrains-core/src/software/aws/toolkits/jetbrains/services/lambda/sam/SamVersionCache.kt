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
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SamTelemetry

object SamVersionCache : FileInfoCache<SemVer>() {
    override fun getFileInfo(path: String): SemVer {
        val executableName = "sam"
        val sanitizedPath = path.nullize(true) ?: throw RuntimeException(message("executableCommon.cli_not_configured", executableName))
        val commandLine = ExecutableCommon.getCommandLine(sanitizedPath, executableName, ExecutableType.getInstance<SamExecutable>()).withParameters("--info")
        val process = CapturingProcessHandler(commandLine).runProcess()

        if (process.exitCode != 0) {
            val output = process.stderr.trimEnd()
            if (output.contains(SamCommon.SAM_INVALID_OPTION_SUBSTRING)) {
                SamTelemetry.info(result = Result.Failed, reason = "SamCliUnexpectedOutput")
                throw IllegalStateException(message("executableCommon.unexpected_output", SamCommon.SAM_NAME, output))
            }
            throw IllegalStateException(output)
        } else {
            val output = process.stdout.trimEnd()
            if (output.isEmpty()) {
                SamTelemetry.info(result = Result.Failed, reason = "SamCliNoOutput")
                throw IllegalStateException(message("executableCommon.empty_info", SamCommon.SAM_NAME))
            }
            val tree = SamCommon.mapper.readTree(output)
            val version = tree.get(SamCommon.SAM_INFO_VERSION_KEY).asText()
            val semVerVersion = SemVer.parseFromText(version)
            if (semVerVersion == null) {
                SamTelemetry.info(result = Result.Failed, reason = "UndetectableSamCliVersion")
            } else {
                SamTelemetry.info(result = Result.Succeeded)
            }
            return semVerVersion ?: throw IllegalStateException(message("executableCommon.version_parse_error", SamCommon.SAM_NAME, version))
        }
    }
}
