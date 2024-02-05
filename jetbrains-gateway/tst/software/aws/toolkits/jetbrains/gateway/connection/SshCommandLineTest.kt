// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.any
import com.github.tomakehurst.wiremock.client.WireMock.anyUrl
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockClassRule
import com.intellij.testFramework.ApplicationRule
import com.intellij.util.io.HttpRequests
import com.intellij.util.net.NetUtils
import com.jetbrains.rd.util.spinUntil
import net.schmizz.sshj.common.Buffer
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.utils.readText
import java.util.Base64

class SshCommandLineTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Rule
    @JvmField
    val sshServer = SshServerRule(tempFolder)

    @Rule
    @JvmField
    val wireMock = WireMockClassRule(
        WireMockConfiguration.wireMockConfig()
            .dynamicPort()
    )

    @Test
    fun `known hosts added`() {
        val hostFile = tempFolder.newFile().toPath()
        SshCommandLine("localhost", port = sshServer.server.port)
            .knownHostsLocation(hostFile)
            .executeAndGetOutput()

        // check that file contains rfc4253 key identifier
        val publicKeyBytes = Buffer.PlainBuffer().putPublicKey(sshServer.server.keyPairProvider.loadKeys(null).first().public).compactData
        assertThat(hostFile.readText().trim()).endsWith(Base64.getEncoder().encodeToString(publicKeyBytes))
    }

    @Test
    fun `local port forwarding`() {
        val wireMockPort = wireMock.port()
        val localPort = NetUtils.findAvailableSocketPort()
        wireMock.stubFor(any(anyUrl()).willReturn(aResponse().withBody("hello from wiremock:${wireMock.port()}").withStatus(200)))

        // redirect localhost:localPort to localhost:wireMockPort
        // ideally, we would bind wiremock to a different loopback address, but macOS doesn't allow this by default
        SshCommandLine("localhost", port = sshServer.server.port)
            .knownHostsLocation(tempFolder.newFile().toPath())
            .localPortForward(localPort, wireMockPort)
            .executeInBackground()

        // race between ssh background process and client
        spinUntil(5_000) { sshServer.clientIsConnected() }

        val response = HttpRequests.request("http://localhost:$localPort").readString()
        assertThat(response).contains(wireMockPort.toString())
    }

    @Test
    fun `execute command`() {
        val output = SshCommandLine("localhost", port = sshServer.server.port)
            .knownHostsLocation(tempFolder.newFile().toPath())
            // server rewrites to this to `ls`; we're testing that the command is runnable on the machine
            .addToRemoteCommand("some complicated command { wow }")
            .executeAndGetOutput()

        assertThat(output.exitCode).isEqualTo(0)
        assertThat(output.stdout).isNotBlank
    }
}
