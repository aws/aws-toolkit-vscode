// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessUtil
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.util.ClearableLazyValue
import com.intellij.openapi.util.SystemInfo

class SshAgentService : Disposable {
    private val agentInstance = ClearableLazyValue.createAtomic { startSshAgentIfRequired() }

    fun agent(): SshAgent = agentInstance.value

    override fun dispose() {
        if (agentInstance.isCached) {
            val agent = agentInstance.value
            agentInstance.drop()
            if (agent is ProcessBasedSshAgent) {
                OSProcessUtil.killProcess(agent.pid)
            }
        }
    }

    companion object {
        fun agentInstance() = service<SshAgentService>().agent()

        // visible for tests
        internal fun startSshAgentIfRequired(existingAgent: String? = System.getenv(SSH_AGENT_VAR)): SshAgent {
            if (existingAgent != null) {
                return ExistingSshAgent(existingAgent)
            }

            if (SystemInfo.isWindows) {
                // TODO: what about WSL2?
                // TODO: probably need to guard against old windows versions
                // if windows is new enough, this will always work
                ExecUtil.execAndGetOutput(
                    GeneralCommandLine("powershell.exe")
                        .withParameters(
                            "-Command",
                            """
                        if ((get-service -name ssh-agent).StartType -eq 'Disabled') { set-service -name ssh-agent -startuptype manual }; if (${'$'}LASTEXITCODE -eq 0) { start-service -name ssh-agent }
                            """.trimIndent()
                        )
                )

                // windows ssh will automatically pick up the correct service
                // TODO: if windows ssh, force GIT_SSH env to windows
                return WindowsServiceSshAgent
            }

            val agentOutput =
                ExecUtil.execAndGetOutput(
                    GeneralCommandLine("ssh-agent")
                        // force bourne sh-style envvar output
                        .withParameters("-s")
                ).stdout

            return ProcessBasedSshAgent.fromStdout(agentOutput)
        }
    }
}
