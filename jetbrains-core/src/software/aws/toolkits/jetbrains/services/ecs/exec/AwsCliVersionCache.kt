// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.util.text.SemVer
import com.intellij.util.text.nullize
import software.aws.toolkits.jetbrains.core.executables.ExecutableCommon
import software.aws.toolkits.jetbrains.utils.FileInfoCache
import software.aws.toolkits.resources.message

object AwsCliVersionCache : FileInfoCache<SemVer>() {
    override fun getFileInfo(path: String): SemVer {
        val executableName = "AWS CLI"
        val sanitizedPath = path.nullize(true) ?: throw RuntimeException(message("executableCommon.cli_not_configured", executableName))
        val commandLine = ExecutableCommon.getCommandLine(sanitizedPath, executableName).withParameters("--version")
        val process = CapturingProcessHandler(commandLine).runProcess()

        if (process.exitCode != 0) {
            val output = process.stderr.trimEnd()
            throw IllegalStateException(output)
        } else {
            val output = process.stdout.trimEnd()
            output.ifEmpty {
                throw IllegalStateException(message("executableCommon.empty_info", executableName))
            }
            /*
            aws --version returns an output in this format: aws-cli/2.1.34 Python/3.8.8 Darwin/19.6.0 exe/x86_64 prompt/off
            We extract the version required using substrings
             */
            val cliVersion = output.substringAfter("aws-cli/").substringBefore(" ")
            return SemVer.parseFromText(cliVersion) ?: throw IllegalStateException(
                message(
                    "executableCommon.version_parse_error",
                    executableName,
                    output
                )
            )
        }
    }
}
