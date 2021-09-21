// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.core.utils.test.aString
import java.nio.file.Path

class ToolTest {
    @Test
    fun `tool instances are equal if type ID is equal`() {
        val path = Path.of(aString())

        val type1 = TestToolType("myId")
        val type2 = TestToolType("myId")
        val type3 = TestToolType("myDifferentId")

        assertThat(type1).isNotEqualTo(type2)

        val tool1 = Tool(type1, path)
        val tool2 = Tool(type2, path)
        val tool3 = Tool(type3, path)

        assertThat(tool1).isEqualTo(tool2)
        assertThat(tool1).isNotEqualTo(tool3)
    }

    @Test
    fun `tool instances are equal if paths are equal`() {
        val type = TestToolType("myId")

        val path1 = Path.of(aString())
        val path2 = Path.of(aString())

        val tool1 = Tool(type, path1)
        val tool2 = Tool(type, path1)
        val tool3 = Tool(type, path2)

        assertThat(tool1).isEqualTo(tool2)
        assertThat(tool1).isNotEqualTo(tool3)
    }

    class TestToolType(override val id: String) : ToolType<SemanticVersion> {
        override val displayName: String = id
        override fun determineVersion(path: Path): SemanticVersion = SemanticVersion(1, 2, 3)
        override fun supportedVersions(): VersionRange<SemanticVersion>? = null
    }
}
