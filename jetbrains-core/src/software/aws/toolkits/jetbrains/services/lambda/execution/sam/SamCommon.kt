// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.util.text.SemVer
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.resources.message

class SamCommon {
    companion object {
        // TODO: change minimum to 0.7.0 before release
        private val expectedSamMinVersion = SemVer("0.6.0", 0, 6, 0)
        private val expectedSamMaxVersion = SemVer("0.8.0", 0, 8, 0)

        fun checkVersion(samVersionLine: String): String? {
            val parsedSemVer = SemVer.parseFromText(samVersionLine.split(" ").last())
                    ?: return message("sam.executable.version_parse_error", samVersionLine)

            val samVersionOutOfRangeMessage = message("sam.executable.version_wrong", expectedSamMinVersion, expectedSamMaxVersion, parsedSemVer)
            if (parsedSemVer >= expectedSamMaxVersion) {
                return "$samVersionOutOfRangeMessage ${message("sam.executable.version_too_high")}"
            } else if (parsedSemVer < expectedSamMinVersion) {
                return "$samVersionOutOfRangeMessage ${message("sam.executable.version_too_low")}"
            }
            return null
        }

        fun validate(path: String? = SamSettings.getInstance().executablePath): String? {
            path ?: return message("lambda.run_configuration.sam.not_specified")
            val commandLine = GeneralCommandLine(path).withParameters("--version")
            return try {
                val process = CapturingProcessHandler(commandLine).runProcess()
                if (process.exitCode != 0) {
                    process.stderr
                }
                val samVersionLine = process.stdoutLines.first()
                checkVersion(samVersionLine)
            } catch (e: Exception) {
                e.localizedMessage
            }
        }
    }
}