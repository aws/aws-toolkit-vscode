// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.caws

import com.intellij.openapi.util.SystemInfo
import com.intellij.ssh.PromiscuousSshHostKeyVerifier
import com.intellij.ssh.config.SshConnectionConfig
import com.intellij.ssh.config.SshProxyConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.tools.MockToolManagerRule
import software.aws.toolkits.jetbrains.core.tools.Tool
import software.aws.toolkits.jetbrains.gateway.connection.AbstractSsmCommandExecutor
import software.aws.toolkits.jetbrains.gateway.connection.StartSessionResponse
import software.aws.toolkits.jetbrains.services.ssm.SsmPlugin
import java.nio.file.Path

class CawsSshConnectionConfigModifierTest {
    @Rule
    @JvmField
    val toolManager = MockToolManagerRule()

    @Test
    fun `modify only mutates CodeCatalyst targets`() {
        val initial = SshConnectionConfig("test")
        val sut = CawsSshConnectionConfigModifier()

        assertThat(sut.modify(initial.host, initial)).isEqualTo(initial)
    }

    @Test
    fun `modify adds proxy command to CodeCatalyst targets`() {
        val dummyExecutor = object : AbstractSsmCommandExecutor(AwsRegion.GLOBAL, "test") {
            val response = StartSessionResponse("session", "stream", "token")

            override fun startSsh() = response
            override fun startSsm(exe: String, vararg args: String) = response
        }
        val mockPath = Path.of("ssm")
        val mockTool = Tool(SsmPlugin, mockPath)

        toolManager.registerTool(SsmPlugin, mockTool)

        val proxyCommand = if (SystemInfo.isWindows) {
            """${mockPath.toAbsolutePath()} "{\"streamUrl\":\"stream\",\"tokenValue\":\"token\",\"sessionId\":\"session\"}" aws-global StartSession"""
        } else {
            """${mockPath.toAbsolutePath()} '{"streamUrl":"stream","tokenValue":"token","sessionId":"session"}' 'aws-global' 'StartSession'"""
        }

        assertThat(CawsSshConnectionConfigModifier.modify(dummyExecutor, SshConnectionConfig("test")))
            .isEqualTo(
                SshConnectionConfig("test").copy(
                    proxyConfig = SshProxyConfig.Command(command = proxyCommand),
                    hostKeyVerifier = PromiscuousSshHostKeyVerifier
                )
            )
    }
}
