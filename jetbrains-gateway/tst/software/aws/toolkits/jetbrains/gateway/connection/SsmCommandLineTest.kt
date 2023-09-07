// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.region.AwsRegion

class SsmCommandLineTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    // match everything after `ssh` as long as it doesn't contain 'ProxyCommand'
    private val prefix = "^.*?s(sh|cp)(?:\\.exe)?(?:(?!ProxyCommand).)*?"
    private val sutFactory = SsmCommandLineFactory(
        "target",
        StartSessionResponse("session", "stream", "token"),
        AwsRegion.GLOBAL,
        overrideSsmPlugin = "session-manager-plugin"
    )

    @Test
    fun `test sshPrefix regex`() {
        // because regex is hard
        val sut = prefix.toPattern()
        assertThat("ssh -o something").matches(sut)
        assertThat("ssh -o ProxyCommand=bad").doesNotMatch(sut)
        assertThat("ssh -o something -o ProxyCommand=bad -o something else").doesNotMatch(sut)
    }

    @Test
    fun `escapes proxy command`() {
        val sut = SsmCommandLineFactory(
            "target",
            StartSessionResponse("session", "stream", "token"),
            AwsRegion.GLOBAL,
            overrideSsmPlugin = "session manager plugin"
        ).sshCommand()

        if (SystemInfo.isWindows) {
            assertThat(sut.constructCommandLine().commandLineString).matches(
                """
                (.*)?-o "ProxyCommand=session manager plugin (.*)?"(.*)?
                """.trimIndent().toPattern()
            )
        } else {
            assertThat(sut.constructCommandLine().commandLineString).matches(
                """
                (.*)?-o "ProxyCommand=session\ manager\ plugin[^"](.*)?
                """.trimIndent().toPattern()
            )
        }
    }

    @Test
    fun `attaches proxy command to ssh for unix`() {
        assumeTrue(SystemInfo.isUnix)
        val sut = sutFactory.sshCommand()
        assertThat(sut.constructCommandLine().commandLineString).matches(
            """
            $prefix -o "ProxyCommand=session-manager-plugin '\{\\"streamUrl\\":\\"stream\\",\\"tokenValue\\":\\"token\\",\\"sessionId\\":\\"session\\"}' 'aws-global' 'StartSession'" -o ServerAliveInterval=60
            """.trimIndent().toPattern()
        )
    }

    @Test
    fun `attaches proxy command to ssh for windows`() {
        assumeTrue(SystemInfo.isWindows)
        val sut = sutFactory.sshCommand()
        assertThat(sut.constructCommandLine().commandLineString).matches(
            """
            $prefix -o "ProxyCommand=session-manager-plugin \\"\{\\\\"streamUrl\\\\":\\\\"stream\\\\",\\\\"tokenValue\\\\":\\\\"token\\\\",\\\\"sessionId\\\\":\\\\"session\\\\"}\\" aws-global StartSession" -o ServerAliveInterval=60
            """.trimIndent().toPattern()
        )
    }

    @Test
    fun `attaches proxy command to scp for unix`() {
        assumeTrue(SystemInfo.isUnix)
        val sut = sutFactory.scpCommand("remote", true)
            .addLocalPaths("localPath")

        assertThat(sut.constructCommandLine().commandLineString).matches(
            """
            $prefix -o "ProxyCommand=session-manager-plugin '\{\\"streamUrl\\":\\"stream\\",\\"tokenValue\\":\\"token\\",\\"sessionId\\":\\"session\\"}' 'aws-global' 'StartSession'" localPath target:remote
            """.trimIndent().toPattern()
        )
    }

    @Test
    fun `attaches proxy command to scp for windows`() {
        assumeTrue(SystemInfo.isWindows)
        val sut = sutFactory.scpCommand("remote", true)
            .addLocalPaths("localPath")

        assertThat(sut.constructCommandLine().commandLineString).matches(
            """
            $prefix-o "ProxyCommand=session-manager-plugin \\"\{\\\\"streamUrl\\\\":\\\\"stream\\\\",\\\\"tokenValue\\\\":\\\\"token\\\\",\\\\"sessionId\\\\":\\\\"session\\\\"}\\" aws-global StartSession" localPath target:remote
            """.trimIndent().toPattern()
        )
    }
}
