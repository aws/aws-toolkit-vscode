// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn

data class RemoteRef(
    val obj: String,
    val ref: String
)

object GitWrappers {
    private val LOG = getLogger<GitWrappers>()
    private const val TIMEOUT_MS = 10000
    const val USER_EMAIL_KEY = "user.email"
    const val USER_NAME_KEY = "user.name"

    fun getRemotes(repo: String): List<RemoteRef>? {
        val output = ExecUtil.execAndGetOutput(
            GeneralCommandLine("git")
                // final "--" to prevent users from passing additional flags through the dialog
                .withParameters("ls-remote", "--heads", "--tags", "--")
                .withParameters(repo),
            TIMEOUT_MS
        )

        if (output.exitCode != 0) {
            LOG.warn { output.stderr }
            return null
        }

        return output.stdoutLines.map {
            val (obj, ref) = it.split("\t", limit = 2)

            RemoteRef(obj, ref.substringAfter("refs/").substringAfter("heads/"))
        }
    }

    fun getConfig(): Map<String, String>? {
        val output = ExecUtil.execAndGetOutput(
            GeneralCommandLine("git")
                .withParameters("config", "--list"),
            TIMEOUT_MS
        )

        if (output.exitCode != 0) {
            LOG.warn { output.stderr }
            return null
        }

        return output.stdoutLines.associate {
            val (k, v) = it.split("=", limit = 2)

            k to v
        }
    }
}
