// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.keyboard
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.io.TempDir
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.findByXpath
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.util.function.Predicate

@Disabled("Needs to be moved to accomodate plugin split")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OpenAwsLocalTerminalTest {

    @TempDir
    lateinit var tempDir: Path

    @Disabled("CodeWhisperer new feature tooltip blocks the button")
    @Test
    @CoreTest
    fun `can open a terminal from explorer`() = uiTest {
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()

            awsExplorer {
                step("click terminal button") {
                    findAndClick("//div[@accessiblename='${message("aws.terminal.action")}' and @class='ActionButton']")
                }
            }

            step("assert terminal shown") {
                val connection = step("find current connection") {
                    findText(Predicate { it.text.startsWith("AWS: ") }).text.substringAfter("AWS: ")
                }
                step("confirm terminal tab showing with connection $connection") {
                    findByXpath("//div[@class='ContentTabLabel' and contains(@text,'$connection')]")
                }
                val terminal = step("find terminal window") {
                    findByXpath("//div[@class='ShellTerminalWidget']")
                }
                step("click in terminal") {
                    terminal.click()
                }
                step("echo out region") {
                    keyboard {
                        enterText("echo \$AWS_REGION")
                        enter()
                    }
                }

                assertThat(terminal.findAllText().joinToString(separator = "") { it.text }).contains(connection.substringAfter("@"))
            }
        }
    }
}
