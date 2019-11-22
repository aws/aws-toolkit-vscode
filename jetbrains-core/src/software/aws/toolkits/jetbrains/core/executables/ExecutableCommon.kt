// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.EnvironmentUtil
import com.intellij.util.text.SemVer
import com.intellij.util.text.nullize
import software.aws.toolkits.jetbrains.utils.FileInfoCache
import software.aws.toolkits.resources.message
import java.time.Duration

class ExecutableCommon {
    companion object {
        fun getCommandLine(path: String, executableName: String): GeneralCommandLine {
            val sanitizedPath = path.nullize(true)
                ?: throw RuntimeException(message("executableCommon.cli_not_configured", executableName))

            // we have some env-hacks that we want to do, so we're building our own environment using the same util as GeneralCommandLine
            // GeneralCommandLine will apply some more env patches prior to process launch (see startProcess()) so this should be fine
            val effectiveEnvironment = EnvironmentUtil.getEnvironmentMap().toMutableMap()
            // apply hacks
            effectiveEnvironment.apply {
                // GitHub issue: https://github.com/aws/aws-toolkit-jetbrains/issues/645
                // strip out any AWS credentials in the parent environment
                remove("AWS_ACCESS_KEY_ID")
                remove("AWS_SECRET_ACCESS_KEY")
                remove("AWS_SESSION_TOKEN")
                // GitHub issue: https://github.com/aws/aws-toolkit-jetbrains/issues/577
                // coerce the locale to UTF-8 as specified in PEP 538
                // this is needed for Python 3.0 up to Python 3.7.0 (inclusive)
                // we can remove this once our IDE minimum version has a fix for https://youtrack.jetbrains.com/issue/PY-30780
                // currently only seeing this on OS X, so only scoping to that
                if (SystemInfo.isMac) {
                    // on other platforms this could be C.UTF-8 or C.UTF8
                    this["LC_CTYPE"] = "UTF-8"
                    // we're not setting PYTHONIOENCODING because we might break SAM on py2.7
                }
            }

            return GeneralCommandLine(sanitizedPath)
                .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.NONE)
                .withEnvironment(effectiveEnvironment)
        }

        /**
         * Compare SemVer version to predefined bounds and throw an exception if out of range.
         * Max version will always be evaluated exclusively, and min version will always be evaluated inclusively
         */
        @JvmStatic
        fun checkSemVerVersion(version: SemVer, min: SemVer, max: SemVer, executableName: String) {
            val versionOutOfRangeMessage = message(
                "executableCommon.version_wrong",
                executableName,
                min,
                max,
                version
            )
            if (version >= max) {
                throw RuntimeException("$versionOutOfRangeMessage ${message("executableCommon.version_too_high")}")
            } else if (version < min) {
                throw RuntimeException("$versionOutOfRangeMessage ${message("executableCommon.version_too_low", executableName)}")
            }
        }

        /**
         * @return Version of the executable, as whatever type is tracked by the FileInfoCache object
         */
        @JvmStatic
        fun <T> getVersion(path: String, executableVersionCache: FileInfoCache<T>, executableName: String): T {
            val sanitizedPath = path.nullize(true)
                ?: throw RuntimeException(message("executableCommon.cli_not_configured", executableName))
            return executableVersionCache.evaluateBlocking(
                sanitizedPath,
                DEFAULT_TIMEOUT.toMillis().toInt()
            ).result
        }

        private val DEFAULT_TIMEOUT = Duration.ofSeconds(5)
    }
}
