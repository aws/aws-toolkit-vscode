// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class YamlWriterTest {
    @Test
    fun testYamlWriter() {
        val text = yamlWriter {
            mapping("Foo") {
                mapping("Bar") {
                    keyValue("Hello", "World")
                    mapping("Some") {
                        keyValue("More", "Keys")
                    }
                    mapping("EvenSome") {
                        keyValue("More2", "Keys2")
                    }
                }
            }
        }
        assertThat(text).isEqualTo("""
            Foo:
              Bar:
                Hello: World
                Some:
                  More: Keys
                EvenSome:
                  More2: Keys2
        """.trimIndent())
    }
}
