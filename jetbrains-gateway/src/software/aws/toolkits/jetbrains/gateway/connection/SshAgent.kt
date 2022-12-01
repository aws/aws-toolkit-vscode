// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

sealed class SshAgent
sealed class SocketBasedSshAgent(
    open val socket: String
) : SshAgent()

object WindowsServiceSshAgent : SshAgent()
data class ExistingSshAgent(override val socket: String) : SocketBasedSshAgent(socket)
data class ProcessBasedSshAgent(
    val pid: Int,
    override val socket: String
) : SocketBasedSshAgent(socket) {

    companion object {
        private val socketRegex = "$SSH_AGENT_VAR=(.*?);".toRegex()
        private val pidRegex = "pid (\\d*?);".toRegex()

        fun fromStdout(stdout: String): ProcessBasedSshAgent =
            ProcessBasedSshAgent(
                pid = pidRegex.find(stdout)?.destructured?.component1()?.toIntOrNull()
                    ?: throw RuntimeException("could not get extract pid from ssh-agent output"),
                socket = socketRegex.find(stdout)?.destructured?.component1()
                    ?: throw RuntimeException("could not get extract socket path from ssh-agent output")
            )
    }
}
