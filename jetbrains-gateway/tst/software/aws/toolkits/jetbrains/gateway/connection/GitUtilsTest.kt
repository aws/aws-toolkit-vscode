// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.registerServiceInstance
import org.assertj.core.api.Assertions.assertThat
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.junit.experimental.runners.Enclosed
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Enclosed::class)
class GitUtilsTest {
    @Ignore
    companion object {
        private val baseCases = listOf(
            "https://host",
            "https://user:pass@host",
            "https://user:pass@host:123",
            // these imply ssh protocol
            "host",
            "user@host",
            // path is expected after the colon
            "host:",
            "user@host:"
        )
    }

    @RunWith(Parameterized::class)
    class ExtractRepoNameHostOnly(private val case: String) {
        companion object {
            @Parameterized.Parameters(name = "{0}")
            @JvmStatic
            fun parameters(): Collection<String> = baseCases.flatMap {
                listOf(
                    it,
                    "$it/",
                    "$it/////",
                    "$it/.git",
                    "$it/.git/",
                    "$it/.git/////"
                )
            }
        }

        @Test
        fun `extracts repo name when only host available`() {
            assertThat(extractRepoName(normalizeRepoUrl(case))).isEqualTo("host")
        }
    }

    @RunWith(Parameterized::class)
    class ExtractRepoNameWithSuffix(private val case: String) {
        companion object {
            @Parameterized.Parameters(name = "{0}")
            @JvmStatic
            fun parameters(): Collection<String> = baseCases.flatMap {
                listOf(
                    "$it/foo",
                    "$it/foo////",
                    "$it/foo/.git",
                    "$it/foo/.git///////",
                    "$it/foo.git/",
                    "$it/foo.git/////",
                    "$it/path/to/foo",
                    "$it/path/to/foo/////",
                    "$it/path/to/foo.git",
                    "$it/path/to/foo.git/////",
                    "$it/path/to/foo/.git",
                    "$it/path/to/foo/.git/////"
                )
            } + listOf(
                "host:rel/path/to/foo",
                "host:rel/path/to/foo/////",
                "host:rel/path/to/foo.git",
                "host:rel/path/to/foo.git/////",
                "host:rel/path/to/foo/.git",
                "host:rel/path/to/foo/.git/////",
                "user@host:rel/path/to/foo",
                "user@host:rel/path/to/foo/////",
                "user@host:rel/path/to/foo.git",
                "user@host:rel/path/to/foo.git/////",
                "user@host:rel/path/to/foo/.git",
                "user@host:rel/path/to/foo/.git/////"
            )
        }

        @Test
        fun `extracts repo name with slashes and suffix`() {
            assertThat(extractRepoName(normalizeRepoUrl(case))).isEqualTo("foo")
        }
    }

    class NormalizeRepoUrl {
        @Test
        fun `normalizes scheme correctly from url`() {
            val sut = { it: String -> normalizeRepoUrl(it).scheme }
            assertThat(sut("host.xz:path/to/repo.git/")).isEqualTo("ssh")
            assertThat(sut("user@host.xz:path/to/repo.git/")).isEqualTo("ssh")
            assertThat(sut("ssh://host.xz/path/to/repo.git/")).isEqualTo("ssh")
            assertThat(sut("ssh://user@host.xz:123/path/to/repo.git/")).isEqualTo("ssh")
            assertThat(sut("git://user@host.xz:123/path/to/repo.git/")).isEqualTo("git")
            assertThat(sut("file:///path/to/repo.git/")).isEqualTo("file")
        }

        @Test
        fun `normalizes authority correctly from url`() {
            val sut = { it: String -> normalizeRepoUrl(it).authority }
            assertThat(sut("host.xz:path/to/repo.git/")).isEqualTo("host.xz")
            assertThat(sut("user@host.xz:path/to/repo.git/")).isEqualTo("user@host.xz")
            assertThat(sut("ssh://host.xz/path/to/repo.git/")).isEqualTo("host.xz")
            assertThat(sut("ssh://user@host.xz:123/path/to/repo.git/")).isEqualTo("user@host.xz:123")
            assertThat(sut("file:///path/to/repo.git/")).isNull()
        }
    }

    class PrimeSSHAgentCommand {
        @Rule
        @JvmField
        val applicationRule = ApplicationRule()

        @Test
        fun `builds command correctly`() {
            ApplicationManager.getApplication().registerServiceInstance(SshAgentService::class.java, SshAgentService())

            val sut = { it: String -> buildAgentPrimeCommand(normalizeRepoUrl(it))?.commandLineString }
            assertThat(sut("host")).isEqualTo("ssh -o AddKeysToAgent=yes -T host")
            assertThat(sut("host.xz:path/to/repo.git/")).endsWith("host.xz")
            assertThat(sut("user@host.xz:path/to/repo.git/")).endsWith("user@host.xz")
            assertThat(sut("ssh://host.xz/path/to/repo.git/")).endsWith("host.xz")
            assertThat(sut("ssh://user@host.xz:123/path/to/repo.git/")).endsWith("user@host.xz -p 123")
            assertThat(sut("git://user@host.xz:123/path/to/repo.git/")).isNull()
        }
    }

    class StartSSHAgentCommand {
        @Test
        fun `noop if agent is available`() {
            assertThat(SshAgentService.startSshAgentIfRequired("agent")).isEqualTo(ExistingSshAgent("agent"))
        }

        @Test
        fun `parses agent pid`() {
            assertThat(ProcessBasedSshAgent.fromStdout(AGENT_OUTPUT).pid).isEqualTo(53580)
        }

        @Test
        fun `parses agent socket`() {
            assertThat(ProcessBasedSshAgent.fromStdout(AGENT_OUTPUT).socket).isEqualTo("/var/folders/5s/asdfafds/T//ssh-SBarNVC4jwLg/agent.53580")
        }

        companion object {
            private val AGENT_OUTPUT =
                """
                SSH_AUTH_SOCK=/var/folders/5s/asdfafds/T//ssh-SBarNVC4jwLg/agent.53580; export SSH_AUTH_SOCK;
                echo Agent pid 53580;
                """.trimIndent()
        }
    }
}
