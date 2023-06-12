// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.util.SystemInfo
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.AwsToolkit
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
    private val overrideSsmPlugin: String? = null,
    private val overrideWindowsWrapper: String? = null
) {
    fun sshCommand(): SshCommandLine {
        val command = SshCommandLine(ssmTarget)
        val proxyCommand = generateProxyCommand()
        command.addSshOption("-o", "ProxyCommand=${proxyCommand.commandString}")
        command.addSshOption("-o", "ServerAliveInterval=60")
        command.withEnvironment(proxyCommand.environment)

        return command
    }

    fun scpCommand(remotePath: String, recursive: Boolean = false): ScpCommandLine {
        val command = ScpCommandLine(ssmTarget, remotePath, recursive)
        val proxyCommand = generateProxyCommand()
        command.addSshOption("-o", "ProxyCommand=${proxyCommand.commandString}")
        command.withEnvironment(proxyCommand.environment)

        return command
    }

    fun rawCommand(): GeneralCommandLine = generateProxyCommand().let {
        GeneralCommandLine(it.exePath)
            .withEnvironment(it.environment)
            .apply {
                if (it.args != null) {
                    withParameters(it.args)
                }
            }
    }

    inner class ProxyCommand(
        val exePath: String,
        val ssmPayload: String? = null,
        val environment: Map<String, String> = emptyMap()
    ) {
        val commandString by lazy {
            buildString {
                append(exePath)
                if (ssmPayload != null) {
                    append(""" '$ssmPayload' ${region.id} StartSession""")
                }
            }
        }

        val args = ssmPayload?.let { listOf(it, region.id, "StartSession") }
    }

    fun generateProxyCommand(): ProxyCommand {
        val ssmPluginJson = """
            {
            "streamUrl":"${sessionParameters.streamUrl}", 
            "tokenValue":"${sessionParameters.tokenValue}", 
            "sessionId":"${sessionParameters.sessionId}"
            }
            """.replace("\\s".toRegex(), "") // Remove any whitespace to avoid issues on Windows

        val ssmPath = overrideSsmPlugin
            ?: ToolManager.getInstance().getOrInstallTool(SsmPlugin).path.toAbsolutePath().toString()

        return if (SystemInfo.isWindows) {
            ProxyCommand(
                exePath = overrideWindowsWrapper
                    ?: AwsToolkit.pluginPath().resolve("gateway-resources").resolve("caws-proxy-command.bat").toAbsolutePath().toString(),
                environment = mapOf(
                    "sessionManagerExe" to ssmPath,
                    "sessionManagerJson" to '"' + ssmPluginJson.replace("\"", "\\\"") + '"',
                    "region" to region.id
                )
            )
        } else {
            ProxyCommand(
                exePath = ssmPath,
                ssmPayload = ssmPluginJson
            )
        }
    }
}
