// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import org.assertj.core.api.Assertions
import org.junit.Test
import software.aws.toolkits.jetbrains.services.clouddebug.nodejs.NodeJsDebuggerSupport
import software.aws.toolkits.resources.message

class NodejsStartCommandAugmenterTest {
    val augmenter = NodeJsDebuggerSupport()

    @Test
    fun augmenterAddsEnvironmentVariable() {
        Assertions.assertThat(augmenter.augmentStatement("node abc.js", listOf(123), ""))
            .contains("${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=123")
        Assertions.assertThat(augmenter.augmentStatement("nodejs abc.js", listOf(123), ""))
            .contains("${CloudDebugConstants.REMOTE_DEBUG_PORT_ENV}=123")
    }

    @Test
    fun augmenterAddsPort() {
        Assertions.assertThat(augmenter.augmentStatement("node abc.js", listOf(123), ""))
            .contains("--inspect-brk=localhost:123")
        Assertions.assertThat(augmenter.augmentStatement("nodejs abc.js", listOf(123), ""))
            .contains("--inspect-brk=localhost:123")
    }

    @Test
    fun augmenterEmptyPortsArray() {
        Assertions.assertThatThrownBy { augmenter.augmentStatement("node abc.js", listOf(), "") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("cloud_debug.step.augment_statement.missing_debug_port"))
    }

    @Test
    fun augmenterIgnoresNonNode() {
        Assertions.assertThat(augmenter.automaticallyAugmentable("node.sh abc")).isFalse()
        Assertions.assertThat(augmenter.automaticallyAugmentable("java abc")).isFalse()
    }

    @Test
    fun augmenterWorksForPaths() {
        Assertions.assertThat(augmenter.automaticallyAugmentable("/abc/node abc.js")).isTrue()
        Assertions.assertThat(augmenter.automaticallyAugmentable("/abc/nodejs abc.js")).isTrue()
        Assertions.assertThat(augmenter.automaticallyAugmentable("\"/abc space in path/node\" abc.js")).isTrue()
        Assertions.assertThat(augmenter.automaticallyAugmentable("\"/abc space in path/nodejs\" abc.js")).isTrue()
    }

    @Test
    fun augmenterDoesNotAugmentWeirdPaths() {
        Assertions.assertThat(augmenter.automaticallyAugmentable("/abc/notnode abc.js")).isFalse()
        Assertions.assertThat(augmenter.automaticallyAugmentable("node.sh abc.js")).isFalse()
        Assertions.assertThat(augmenter.automaticallyAugmentable("node")).isFalse()
        Assertions.assertThat(augmenter.automaticallyAugmentable("\"/abc space in path/notnode\" abc.js")).isFalse()
    }

    @Test
    fun augmenterAugmentsPathsCorrectly() {
        Assertions.assertThat(augmenter.augmentStatement("/abc/node abc.js", listOf(123), ""))
            .contains("/abc/node --inspect-brk=localhost:123 abc.js")
        Assertions.assertThat(augmenter.augmentStatement("\"/abc space in path/node\" abc.js", listOf(123), ""))
            .contains("\"/abc space in path/node\" --inspect-brk=localhost:123 abc.js")
    }
}
