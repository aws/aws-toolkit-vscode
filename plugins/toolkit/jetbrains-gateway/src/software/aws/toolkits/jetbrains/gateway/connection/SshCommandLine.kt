// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.ParamsGroup
import com.intellij.execution.process.KillableProcessHandler
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutput
import com.intellij.execution.util.ExecUtil
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.io.BaseOutputReader
import org.jetbrains.annotations.TestOnly
import java.nio.file.Path

open class SshCommandLine(private val target: String, port: Int? = null) {
    private val sshOptions = ParamsGroup(SSH_OPTIONS)
    private val remoteCommand = ParamsGroup(REMOTE_COMMAND)
    private val additionalEnvironment = mutableMapOf<String, String>()

    init {
        // TODO: requires openssh7.6+, but al2 only ships 7.4 for fips. probably need to manually run ssh-keyscan
        // ideally should be accept-new
        addSshOption("-o", "StrictHostKeyChecking=no")
        addSshOption("-v")
        port?.let {
            addSshOption("-p", it.toString())
        }
    }

    fun addSshOption(vararg option: String): SshCommandLine = apply {
        sshOptions.addParameters(*option)
    }

    fun addToRemoteCommand(vararg cmd: String): SshCommandLine = apply {
        remoteCommand.addParameters(*cmd)
    }

    fun localPortForward(localPort: Int, remotePort: Int, noShell: Boolean = true): SshCommandLine =
        localPortForward(localPort, "localhost", remotePort, noShell)

    fun localPortForward(localPort: Int, destination: String, remotePort: Int, noShell: Boolean): SshCommandLine = apply {
        if (noShell) {
            addSshOption("-N")
        }
        // local forwarding
        addSshOption("-L")
        addSshOption("$localPort:$destination:$remotePort")
    }

    fun withEnvironment(map: Map<String, String>) = apply {
        additionalEnvironment.putAll(map)
    }

    @TestOnly
    fun knownHostsLocation(location: Path) = apply {
        addSshOption("-o", "UserKnownHostsFile=${location.toAbsolutePath()}")
    }

    fun constructCommandLine(): GeneralCommandLine {
        val commandLine = GeneralCommandLine(resolveSshExecutable())
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)

        commandLine.parametersList.apply {
            add(target)
            addParamsGroup(sshOptions)
            addParamsGroup(remoteCommand)
        }

        commandLine.withEnvironment(additionalEnvironment)

        return commandLine
    }

    fun executeInBackground(listener: ProcessListener? = null): ProcessHandler {
        val processHandler = object : KillableProcessHandler(
            constructCommandLine()
                .also {
                    // background process; don't connect standard input
                    it.addParameters("-n")
                }
        ) {
            override fun readerOptions(): BaseOutputReader.Options = BaseOutputReader.Options.forMostlySilentProcess()
        }

        listener?.let { processHandler.addProcessListener(it) }

        processHandler.startNotify()

        return processHandler
    }

    fun executeAndGetOutput(): ProcessOutput = ExecUtil.execAndGetOutput(constructCommandLine())

    private fun resolveSshExecutable(): String {
        if (!SystemInfo.isWindows) {
            return "ssh"
        }

        // TODO: make sure "Get-WindowsCapability -Online | ? Name -like 'OpenSSH.Client*'" returns "Installed"
        return "${System.getenv("SystemRoot")}\\System32\\OpenSSH\\ssh.exe"
    }

    companion object {
        private const val SSH_OPTIONS = "sshOptions"
        private const val REMOTE_COMMAND = "sshCommand"
        private const val ADDITIONAL_OPTIONS = "sshAdditionalOptions"
    }
}
