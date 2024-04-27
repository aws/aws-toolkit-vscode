// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.waitFor
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.TestInstance.Lifecycle
import org.junit.jupiter.api.io.TempDir
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.preferencesDialog
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.time.Duration

@Disabled("Needs to be moved to accomodate plugin split")
@TestInstance(Lifecycle.PER_CLASS)
class DynamicResourcesSettingsTest {
    @TempDir
    lateinit var tempDir: Path

    private val otherResources = message("explorer.node.other")

    @Test
    @CoreTest
    fun testSettingsPane() = uiTest {
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()

            awsExplorer {
                step("Open dynamic resources settings") {
                    expandExplorerNode(otherResources)
                    explorerTree().doubleClickPath(otherResources, message("explorer.node.other.add_remove"), fullMatch = false)
                }
            }

            preferencesDialog {
                // Search for AWS because sometimes it is off the screen
                search(message("aws.settings.title"))

                selectPreferencePage("Tools", message("aws.settings.title"), message("aws.settings.dynamic_resources_configurable.title"))

                val applyButton = button("Apply")

                step("Select all resources") {
                    button(message("aws.settings.dynamic_resources_configurable.select_all")).click()
                    waitFor { applyButton.isEnabled() }
                    applyButton.click()

                    awsExplorer {
                        retryableAssert(timeout = Duration.ofSeconds(5)) {
                            assertThat(explorerTree().findAllText { it.text.contains(message("aws.settings.title")) }).isNotEmpty()
                        }
                    }
                }

                step("Clear all resources") {
                    button(message("aws.settings.dynamic_resources_configurable.clear_all")).click()
                    waitFor { applyButton.isEnabled() }
                    applyButton.click()

                    awsExplorer {
                        retryableAssert(timeout = Duration.ofSeconds(5)) {
                            assertThat(explorerTree().findAllText { it.text.contains("AWS") }).isEmpty()
                        }
                    }
                }
            }
        }
    }
}
