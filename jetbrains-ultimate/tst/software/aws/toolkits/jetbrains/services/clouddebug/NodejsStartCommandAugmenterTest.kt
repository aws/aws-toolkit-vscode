// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.aws.toolkits.jetbrains.services.clouddebug.nodejs.NodeJsDebuggerSupport
import software.aws.toolkits.resources.message

class NodejsStartCommandAugmenterTest {
    private val augmenter = NodeJsDebuggerSupport()
    private val nodeRun = "node abc.js"

    @Test
    fun augmenterAddsEnvironmentVariable() {
        assertThat(augmenter.augmentStatement(nodeRun, listOf(123), ""))
            .contains("${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=123")
        assertThat(augmenter.augmentStatement("nodejs abc.js", listOf(123), ""))
            .contains("${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=123")
    }

    @Test
    fun augmenterAddsPort() {
        assertThat(augmenter.augmentStatement(nodeRun, listOf(123), ""))
            .contains("--inspect-brk=localhost:123")
        assertThat(augmenter.augmentStatement("nodejs abc.js", listOf(123), ""))
            .contains("--inspect-brk=localhost:123")
    }

    @Test
    fun augmenterEmptyPortsArray() {
        assertThatThrownBy { augmenter.augmentStatement(nodeRun, listOf(), "") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("cloud_debug.step.augment_statement.missing_debug_port"))
    }

    @Test
    fun augmenterIgnoresNonNode() {
        assertThat(augmenter.automaticallyAugmentable("node.sh abc")).isFalse()
        assertThat(augmenter.automaticallyAugmentable("java abc")).isFalse()
    }

    @Test
    fun augmenterWorksForPaths() {
        assertThat(augmenter.automaticallyAugmentable("/abc/node abc.js")).isTrue()
        assertThat(augmenter.automaticallyAugmentable("/abc/nodejs abc.js")).isTrue()
        assertThat(augmenter.automaticallyAugmentable("\"/abc space in path/node\" abc.js")).isTrue()
        assertThat(augmenter.automaticallyAugmentable("\"/abc space in path/nodejs\" abc.js")).isTrue()
    }

    @Test
    fun augmenterDoesNotAugmentWeirdPaths() {
        assertThat(augmenter.automaticallyAugmentable("/abc/notnode abc.js")).isFalse()
        assertThat(augmenter.automaticallyAugmentable("node.sh abc.js")).isFalse()
        assertThat(augmenter.automaticallyAugmentable("node")).isFalse()
        assertThat(augmenter.automaticallyAugmentable("\"/abc space in path/notnode\" abc.js")).isFalse()
    }

    @Test
    fun augmenterAugmentsPathsCorrectly() {
        assertThat(augmenter.augmentStatement("/abc/node abc.js", listOf(123), ""))
            .contains("/abc/node --inspect-brk=localhost:123 abc.js")
        assertThat(augmenter.augmentStatement("\"/abc space in path/node\" abc.js", listOf(123), ""))
            .contains("\"/abc space in path/node\" --inspect-brk=localhost:123 abc.js")
    }
}
