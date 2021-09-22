// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.deserializeState
import software.aws.toolkits.jetbrains.utils.serializeState
import java.nio.file.Path

class ToolSettingsTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Test
    fun `null path removes its state`() {
        val settings = ToolSettings.getInstance()
        val path = aString()
        settings.setExecutablePath(TestExecutable, path)
        assertThat(settings.getExecutablePath(TestExecutable)).isEqualTo(path)

        settings.setExecutablePath(TestExecutable, null)
        assertThat(settings.getExecutablePath(TestExecutable)).isNull()
    }

    @Test
    fun `state can be loaded`() {
        val settings = ToolSettings.getInstance()

        deserializeState(
            """
                <executables>
                    <option name="value">
                        <map>
                            <entry key="testExecutable">
                                <value>
                                    <ExecutableState path="/some/path" />
                                </value>
                            </entry>
                        </map>
                    </option>
                </executables>
            """,
            settings
        )

        assertThat(settings.getExecutablePath(TestExecutable)).isEqualTo("/some/path")
    }

    @Test
    fun `state can be saved`() {
        val settings = ToolSettings.getInstance()
        settings.setExecutablePath(TestExecutable, "/some/path")

        assertThat(serializeState("executables", settings))
            .isEqualToIgnoringWhitespace(
                """
                    <executables>
                        <option name="value">
                            <map>
                                <entry key="testExecutable">
                                    <value>
                                        <ExecutableState path="/some/path" />
                                    </value>
                                </entry>
                            </map>
                        </option>
                    </executables>
                """.trimIndent()
            )
    }

    object TestExecutable : ToolType<SemanticVersion> {
        override val displayName: String = "Test Tool"
        override val id: String = "testExecutable"

        override fun determineVersion(path: Path) = SemanticVersion(1, 2, 3)
        override fun supportedVersions(): VersionRange<SemanticVersion>? = null
    }
}
