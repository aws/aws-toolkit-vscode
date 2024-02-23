// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.openapi.util.SystemInfo
import com.intellij.util.net.NetUtils
import org.apache.sshd.scp.server.ScpCommandFactory
import org.apache.sshd.server.SshServer
import org.apache.sshd.server.auth.UserAuthNoneFactory
import org.apache.sshd.server.forward.AcceptAllForwardingFilter
import org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider
import org.apache.sshd.server.shell.ProcessShellCommandFactory
import org.apache.sshd.sftp.server.SftpSubsystemFactory
import org.assertj.core.api.Assertions.assertThat
import org.junit.rules.ExternalResource
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.readText
import java.nio.file.Paths

class SshServerRule(private val tempFolderRule: TemporaryFolder) : ExternalResource() {
    lateinit var server: SshServer
    lateinit var scpCommandFactory: ScpCommandFactory
    lateinit var sftpSubsystemFactory: SftpSubsystemFactory

    private var knownHosts: String? = null
    private val hostsFile = Paths.get(System.getProperty("user.home"), ".ssh", "known_hosts")

    override fun before() {
        if (hostsFile.exists()) {
            knownHosts = hostsFile.readText()
        }

        scpCommandFactory = ScpCommandFactory.Builder()
            .withDelegate { channel, _ ->
                val command = if (SystemInfo.isUnix) { "ls" } else { "cmd.exe /c dir" }
                ProcessShellCommandFactory.INSTANCE.createCommand(channel, command)
            }
            .build()

        sftpSubsystemFactory = SftpSubsystemFactory.Builder()
            .build()

        server = SshServer.setUpDefaultServer().also {
            it.port = NetUtils.findAvailableSocketPort()
            it.keyPairProvider = SimpleGeneratorHostKeyProvider(tempFolderRule.newFile().toPath())
            it.forwardingFilter = AcceptAllForwardingFilter()
            it.commandFactory = scpCommandFactory
            it.subsystemFactories = listOf(sftpSubsystemFactory)
        }

        server.start()
        // disable auth because tests blow up on windows due to failure to open /dev/tty on interactive auth
        server.sessionFactory.factoryManager.userAuthFactories = listOf(UserAuthNoneFactory.INSTANCE)
    }

    override fun after() {
        server.stop()

        val hostsFileModifiedError = { "Test erroneously pollutes the known_hosts file in the user home directory" }
        if (knownHosts == null) {
            assertThat(hostsFile.exists())
                .withFailMessage(hostsFileModifiedError)
                .isFalse
        } else {
            assertThat(hostsFile.readText())
                .withFailMessage(hostsFileModifiedError)
                .isEqualTo(knownHosts)
        }
    }

    fun clientIsConnected() = server.activeSessions.isNotEmpty() && server.activeSessions.all { it.isAuthenticated }
}
