// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.util.text.SemVer
import software.aws.toolkits.jetbrains.utils.FileInfoCache
import software.aws.toolkits.resources.message

object SamVersionCache : FileInfoCache<SemVer>() {
    override fun getFileInfo(path: String): SemVer {
        val commandLine = SamCommon.getSamCommandLine(path).withParameters("--info")
        val process = CapturingProcessHandler(commandLine).runProcess()

        if (process.exitCode != 0) {
            val output = process.stderr.trimEnd()
            if (output.contains(SamCommon.SAM_INVALID_OPTION_SUBSTRING)) {
                throw IllegalStateException(message("sam.executable.unexpected_output", output))
            }
            throw IllegalStateException(output)
        } else {
            val output = process.stdout.trimEnd()
            if (output.isEmpty()) {
                throw IllegalStateException(message("sam.executable.empty_info"))
            }
            val tree = SamCommon.mapper.readTree(output)
            val version = tree.get(SamCommon.SAM_INFO_VERSION_KEY).asText()
            return SemVer.parseFromText(version)
                ?: throw IllegalStateException(message("sam.executable.version_parse_error", version))
        }
    }
}
