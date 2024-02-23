// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.registry.Registry
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.reset
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import java.io.File
import java.time.Duration
import java.time.Instant
import kotlin.time.ExperimentalTime
import kotlin.time.measureTime
import kotlin.time.toJavaDuration

class ToolkitCredentialProcessProviderTest {
    @Rule
    @JvmField
    val project = ProjectRule()

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    private val parser = mock<CredentialProcessOutputParser>()

    @Before
    fun setup() {
        reset(parser)
        Registry.get("aws.credentialProcess.timeout").resetToDefault()
    }

    @Test
    fun `basic credential fetch`() {
        val blah = "echo"
        val sut = createSut(blah)

        stubParser(CredentialProcessOutput("foo", "bar", null, null))

        val credentials = sut.resolveCredentials()

        assertThat(credentials).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("foo")
            assertThat(it.secretAccessKey()).isEqualTo("bar")
        }
    }

    @Test
    fun `session credentials fetch`() {
        val sut = createSut("echo")

        stubParser(CredentialProcessOutput("foo", "bar", "token", null))

        val credentials = sut.resolveCredentials()

        assertThat(credentials).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("foo")
            assertThat(it.secretAccessKey()).isEqualTo("bar")
            assertThat(it.sessionToken()).isEqualTo("token")
        }
    }

    @Test
    fun `actually executes the command`() {
        val sut = createSut("echo hello")

        stubParser(CredentialProcessOutput("foo", "bar", null, null))

        sut.resolveCredentials()

        val captor = argumentCaptor<String>().apply {
            verify(parser).parse(capture())
        }

        assertThat(captor.firstValue).contains("hello")
    }

    @Test
    fun `expiry in the future means command is not re-run`() {
        val sut = createSut("echo")
        stubParser(CredentialProcessOutput("foo", "bar", null, Instant.now().plus(Duration.ofHours(1))))

        sut.resolveCredentials()
        sut.resolveCredentials()

        verify(parser).parse(any())
        verifyNoMoreInteractions(parser)
    }

    @Test
    fun `no expiry means command is not re-run`() {
        val sut = createSut("echo")
        stubParser(CredentialProcessOutput("foo", "bar", null, null))

        sut.resolveCredentials()
        sut.resolveCredentials()

        verify(parser).parse(any())
        verifyNoMoreInteractions(parser)
    }

    @Test
    fun `expiry in the past means command is not re-run`() {
        // Java SDK prefers threads to block when this happens https://github.com/aws/aws-sdk-java-v2/commit/5151e4049382bdb5ea6b487e6f150314b579181d
        val sut = createSut("echo")
        stubParser(CredentialProcessOutput("foo", "bar", null, Instant.now().minus(Duration.ofHours(1))))

        sut.resolveCredentials()
        sut.resolveCredentials()

        verify(parser).parse(any())
    }

    @Test
    fun `spaces in commands are handled`() {
        val cmd = if (SystemInfo.isWindows) {
            "dir"
        } else {
            "ls"
        }
        val folderWithSpaceInItsName = folder.newFolder("hello world")
        val file = File(folderWithSpaceInItsName, "foo")
        file.writeText("bar")

        val sut = createSut("""$cmd ${folder.root.absolutePath}${File.separator}"hello world"""")
        stubParser()

        sut.resolveCredentials()

        val captor = argumentCaptor<String>().apply {
            verify(parser).parse(capture())
        }

        assertThat(captor.firstValue).contains("foo")
    }

    @Test
    fun `handles non-zero exit codes appropriately`() {
        val cmd = if (SystemInfo.isWindows) {
            "dir"
        } else {
            "ls"
        }

        val sut = createSut("$cmd non-existing-folder")

        assertThatThrownBy { sut.resolveCredentials() }.hasMessageContaining("Failed to execute credential_process ($cmd)")
        verifyNoMoreInteractions(parser)
    }

    @Test
    fun `handles quoted commands`() {
        val cmd = if (SystemInfo.isWindows) {
            """
                "dir"
            """.trimIndent()
        } else {
            """
                ls
            """.trimIndent()
        }

        val folderWithSpaceInItsName = folder.newFolder("hello world")
        val file = File(folderWithSpaceInItsName, "foo")
        file.writeText("bar")

        val sut = createSut("""$cmd ${folder.root.absolutePath}${File.separator}"hello world"""")
        stubParser()

        sut.resolveCredentials()

        val captor = argumentCaptor<String>().apply {
            verify(parser).parse(capture())
        }

        assertThat(captor.firstValue).contains("foo")
    }

    @Test
    fun `has path`() {
        val cmd = if (SystemInfo.isWindows) {
            "SET"
        } else {
            "env"
        }
        val sut = createSut(cmd)
        stubParser()
        sut.resolveCredentials()

        val captor = argumentCaptor<String>().apply {
            verify(parser).parse(capture())
        }

        assertThat(captor.firstValue).contains("PATH")
    }

    @Test
    fun `can handle parse exception`() {
        assertThatThrownBy {
            ToolkitCredentialProcessProvider("echo hello").resolveCredentials()
        }.hasMessage("Failed to parse credential_process response")
    }

    @ExperimentalTime
    @Test
    fun `command times out after specified period`() {
        val cmd = if (SystemInfo.isWindows) {
            "ping -n 10 127.0.0.1"
        } else {
            "sleep 5"
        }
        val timeoutSetting = Registry.get("aws.credentialProcess.timeout")
        val timeout = timeoutSetting.asInteger().toLong()
        timeoutSetting.setValue(200)
        val time = measureTime {
            assertThatThrownBy { createSut(cmd).resolveCredentials() }.hasMessageContaining("timed out")
        }

        assertThat(time.toJavaDuration()).isLessThan(Duration.ofMillis(timeout))
    }

    private fun stubParser(output: CredentialProcessOutput = CredentialProcessOutput("foo", "bar", null, null)) {
        parser.stub {
            on { parse(any()) }.thenReturn(output)
        }
    }

    private fun createSut(cmd: String) = ToolkitCredentialProcessProvider(cmd, parser)
}
