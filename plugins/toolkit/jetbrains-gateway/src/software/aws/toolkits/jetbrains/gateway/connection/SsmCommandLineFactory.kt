// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.CommandLineUtil
import com.intellij.execution.Platform
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.util.SystemInfo
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.tools.ToolManager
import software.aws.toolkits.jetbrains.services.ssm.SsmPlugin

// Modeling fields of [software.amazon.awssdk.services.ssm.model.StartSessionResponse] without pulling in the entire SDK service package
data class StartSessionResponse(
    val sessionId: String,
    val streamUrl: String,
    val tokenValue: String
) {
    override fun toString() = "StartSessionResponse(sessionId='$sessionId', streamUrl='***', tokenValue='***')"
}

class SsmCommandLineFactory(
    private val ssmTarget: String,
    private val sessionParameters: StartSessionResponse,
    private val region: AwsRegion,
    private val overrideSsmPlugin: String? = null
) {
    fun sshCommand(): SshCommandLine {
        val command = SshCommandLine(ssmTarget)
        command.addSshOption("-o", "ProxyCommand=${proxyCommand()}")
        command.addSshOption("-o", "ServerAliveInterval=60")

        return command
    }

    fun scpCommand(remotePath: String, recursive: Boolean = false): ScpCommandLine {
        val command = ScpCommandLine(ssmTarget, remotePath, recursive)
        command.addSshOption("-o", "ProxyCommand=${proxyCommand()}")

        return command
    }

    /**
     * This returns a GeneralCommandLine is meant to be executed directly.
     * Use [proxyCommand] instead if you need a value for the SSH "ProxyCommand" property
     */
    fun rawCommand(): GeneralCommandLine = generateProxyCommand().let {
        GeneralCommandLine(it.exePath)
            .withParameters(it.args)
    }

    inner class ProxyCommand(
        val exePath: String,
        val args: List<String>
    )

    /**
     * This is meant to be passed directly as a value into the SSH "ProxyCommand" property
     * Use [rawCommand] instead for command execution
     */
    fun proxyCommand(): String {
        val rawCommand = rawCommand()

        return if (SystemInfo.isWindows) {
            // see [GeneralCommandLine.getPreparedCommandLine]
            CommandLineUtil.toCommandLine(rawCommand.exePath, rawCommand.parametersList.list, Platform.current()).joinToString(separator = " ")
        } else {
            // on *nix, the quoting on getPreparedCommandLine is not quite correct since the arguments aren't being passed directly to execv
            buildString {
                append(rawCommand.exePath)
                rawCommand.parametersList.list.forEach {
                    append(" '$it'")
                }
            }
        }
    }

    private fun generateProxyCommand(): ProxyCommand {
        val ssmPluginJson = """
            {
            "streamUrl":"${sessionParameters.streamUrl}", 
            "tokenValue":"${sessionParameters.tokenValue}", 
            "sessionId":"${sessionParameters.sessionId}"
            }
            """.replace("\\s".toRegex(), "") // Remove any whitespace to avoid issues on Windows

        val ssmPath = overrideSsmPlugin
            ?: ToolManager.getInstance().getOrInstallTool(SsmPlugin).path.toAbsolutePath().toString()

        return ProxyCommand(
            ssmPath,
            listOf(ssmPluginJson, region.id, "StartSession")
        )
    }
}
