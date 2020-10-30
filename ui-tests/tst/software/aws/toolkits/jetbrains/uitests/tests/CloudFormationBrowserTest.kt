// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.attempt
import com.intellij.remoterobot.utils.waitFor
import com.intellij.remoterobot.utils.waitForIgnoringError
import org.assertj.core.api.AbstractStringAssert
import org.assertj.core.api.Assertions.assertThat
import org.assertj.swing.core.MouseButton
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.TestInstance.Lifecycle
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.IdeaFrame
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.pressOk
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.awt.Toolkit
import java.awt.datatransfer.DataFlavor
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Duration
import java.util.UUID

@TestInstance(Lifecycle.PER_CLASS)
class CloudFormationBrowserTest {
    private val templateFileName = "SQSQueue.yml"
    private val templateFile: Path = Paths.get(System.getProperty("testDataPath")).resolve("testFiles").resolve(templateFileName)
    private val stack = "uitest-${UUID.randomUUID()}"

    private val CloudFormation = "CloudFormation"
    private val queueName = "SQSQueue"
    private val deleteStackText = "Delete Stack..."

    @TempDir
    lateinit var tempDir: Path
    lateinit var cloudFormationClient: CloudFormationClient

    @BeforeAll
    fun deployStack() {
        log.info("Deploying stack $stack before the test run")
        cloudFormationClient = CloudFormationClient.create()
        cloudFormationClient.createStack { it.templateBody(templateFile.toFile().readText()).stackName(stack) }
        waitForIgnoringError(Duration.ofSeconds(120), Duration.ofSeconds(5)) {
            cloudFormationClient.describeStacks { it.stackName(stack) }.hasStacks()
        }
        log.info("Successfully deployed $stack")
    }

    @Test
    @CoreTest
    fun testCloudFormationBrowser() = uiTest {
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()
            showAwsExplorer()
        }
        idea {
            step("Open stack") {
                awsExplorer {
                    expandExplorerNode(CloudFormation)
                    doubleClickExplorer(CloudFormation, stack)
                }
            }
            step("Can copy IDs from tree") {
                val queueNode = step("Finding '$queueName [CREATE_COMPLETE]'") {
                    attempt(5) {
                        findText("$queueName [CREATE_COMPLETE]")
                    }
                }
                step("Logical ID") {
                    queueNode.click(MouseButton.RIGHT_BUTTON)
                    findAndClick("//div[@text='Copy Logical ID']")

                    assertClipboardContents().isEqualTo(queueName)
                }
                step("Physical ID") {
                    queueNode.click(MouseButton.RIGHT_BUTTON)
                    findAndClick("//div[@text='Copy Physical ID']")
                    assertClipboardContents().startsWith("https").contains(queueName)
                }
            }
            step("Check events") {
                clickOn("Events")
                val resource = step("Assert that there are two CREATE_COMPLETE events shown") {
                    val createComplete = findAllText("CREATE_COMPLETE")
                    assertThat(createComplete).hasSize(2)
                    createComplete.first()
                }

                step("Check Logical ID action") {
                    resource.click(MouseButton.RIGHT_BUTTON)
                    findAndClick("//div[@text='Copy Logical ID']")
                    assertClipboardContents().satisfiesAnyOf(
                        { assertThat(it).isEqualTo(queueName) },
                        { assertThat(it).startsWith("uitest") }
                    )
                }
                step("Check Physical ID action") {
                    resource.click(MouseButton.RIGHT_BUTTON)
                    findAndClick("//div[@text='Copy Physical ID']")

                    assertClipboardContents().satisfiesAnyOf(
                        { assertThat(it).startsWith("https").contains(queueName) },
                        { assertThat(it).startsWith("arn") }
                    )
                }
            }
            step("Check outputs") {
                clickOn("Outputs")
                step("Assert that the stack output is there") {
                    findText("Cool description")
                }
            }
            step("Check resources") {
                clickOn("Resources")
                val resource = step("Assert that the stack resource is there") {
                    val createComplete = findAllText("CREATE_COMPLETE")
                    assertThat(createComplete).hasSize(1)
                    createComplete.first()
                }

                step("Check Logical ID action") {
                    resource.click(MouseButton.RIGHT_BUTTON)
                    findAndClick("//div[@text='Copy Logical ID']")

                    assertClipboardContents().isEqualTo(queueName)
                }
                step("Check Physical ID action") {
                    resource.click(MouseButton.RIGHT_BUTTON)
                    findAndClick("//div[@text='Copy Physical ID']")

                    assertClipboardContents().startsWith("https").contains(queueName)
                }
            }
            step("Delete stack $stack") {
                showAwsExplorer()
                awsExplorer {
                    openExplorerActionMenu(CloudFormation, stack)
                }
                findAndClick("//div[@text='$deleteStackText']")
                fillSingleTextField(stack)
                pressOk()
            }

            waitForStackDeletion()

            step("Check for the stack deletion notification") {
                // Sometimes the toast takes a while to show up so give it a longer timeout
                val toast = findToast(Duration.ofSeconds(10))
                assertThat(toast.hasText { it.text.contains("Deleted Stack '$stack'") })
            }
        }
    }

    @AfterAll
    fun cleanup() {
        // Make sure that we delete the stack even if it fails in the UIs
        try {
            cloudFormationClient.deleteStack { it.stackName(stack) }
        } catch (e: Exception) {
            log.error("Delete stack threw an exception", e)
        }
        waitForStackDeletion()
    }

    private fun assertClipboardContents(): AbstractStringAssert<*> =
        assertThat(Toolkit.getDefaultToolkit().systemClipboard.getData(DataFlavor.stringFlavor) as String)

    private fun IdeaFrame.clickOn(tab: String) {
        findAndClick("//div[@accessiblename='$tab' and @class='JLabel' and @text='$tab']")
    }

    private fun waitForStackDeletion() {
        log.info("Waiting for the deletion of stack $stack")
        waitFor(duration = Duration.ofSeconds(180), interval = Duration.ofSeconds(5)) {
            // wait until the stack is gone
            try {
                cloudFormationClient.describeStacks { it.stackName(stack) }.stacks().first().stackStatus() == StackStatus.DELETE_COMPLETE
            } catch (e: Exception) {
                e is CloudFormationException && e.awsErrorDetails().errorCode() == "ValidationError"
            }
        }
        log.info("Finished deleting stack $stack")
    }
}
