// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.ParamsGroup
import com.intellij.openapi.util.SystemInfo
import org.jetbrains.annotations.TestOnly
import java.nio.file.Path

open class ScpCommandLine(
    remoteHost: String,
    remotePath: String,
    recursive: Boolean = false,
    port: Int? = null
) {
    private val sshOptions = ParamsGroup(SSH_OPTIONS)
    private val localPaths = ParamsGroup(LOCAL_PATHS)
    private val additionalEnvironment = mutableMapOf<String, String>()

    // required because this needs to be last
    private val remoteTarget = ParamsGroup(REMOTE_TARGET)
    protected val additionalOptions = ParamsGroup(ADDITIONAL_OPTIONS)

    init {
        if (recursive) {
            addSshOption("-r")
        }

        // TODO: requires openssh7.6+, but al2 only ships 7.4 for fips. probably need to manually run ssh-keyscan
        // ideally should be accept-new
        addSshOption("-o", "StrictHostKeyChecking=no")
        addSshOption("-v")

        port?.let {
            // unlike SSH, port is capitalized
            addSshOption("-P", it.toString())
        }

        remoteTarget.addParameter("$remoteHost:$remotePath")
    }

    fun addSshOption(vararg option: String): ScpCommandLine = apply {
        sshOptions.addParameters(*option)
    }

    fun addLocalPaths(vararg path: String): ScpCommandLine = apply {
        localPaths.addParameters(*path)
    }

    fun addLocalPaths(vararg path: Path): ScpCommandLine = apply {
        addLocalPaths(*path.map { it.toAbsolutePath().toString() }.toTypedArray())
    }

    fun withEnvironment(map: Map<String, String>) = apply {
        additionalEnvironment.putAll(map)
    }

    @TestOnly
    fun knownHostsLocation(location: Path) = apply {
        addSshOption("-o", "UserKnownHostsFile=${location.toAbsolutePath()}")
    }

    fun constructCommandLine(): GeneralCommandLine {
        val commandLine = GeneralCommandLine(resolveExecutable())
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)

        commandLine.parametersList.apply {
            addParamsGroup(sshOptions)
            addParamsGroup(additionalOptions)
            addParamsGroup(localPaths)
            // needs to be last
            addParamsGroup(remoteTarget)
        }

        commandLine.withEnvironment(additionalEnvironment)

        return commandLine
    }

    private fun resolveExecutable(): String {
        if (!SystemInfo.isWindows) {
            return "scp"
        }

        // TODO: make sure "Get-WindowsCapability -Online | ? Name -like 'OpenSSH.Client*'" returns "Installed"
        return "${System.getenv("SystemRoot")}\\System32\\OpenSSH\\scp.exe"
    }

    companion object {
        private const val SSH_OPTIONS = "sshOptions"
        private const val LOCAL_PATHS = "localPaths"
        private const val REMOTE_TARGET = "remoteTarget"
        private const val ADDITIONAL_OPTIONS = "sshAdditionalOptions"
    }
}
