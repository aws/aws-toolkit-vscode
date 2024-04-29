// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.TestInstance.Lifecycle
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.IdeaFrame
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.fillDeletionAndConfirm
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Duration
import java.util.UUID

@Disabled("Needs to be moved to accomodate plugin split")
@TestInstance(Lifecycle.PER_CLASS)
class CloudFormationBrowserTest {
    private val templateFileName = "SQSQueue.yml"
    private val templateFile: Path = Paths.get(System.getProperty("testDataPath")).resolve("testFiles").resolve(templateFileName)
    private val stack = "uitest-${UUID.randomUUID()}"

    private val cloudFormation = "CloudFormation"
    private val deleteStackText = "Delete Stack..."

    @TempDir
    lateinit var tempDir: Path
    lateinit var cloudFormationClient: CloudFormationClient

    @BeforeAll
    fun deployStack() {
        log.info("Deploying stack $stack before the test run")
        cloudFormationClient = CloudFormationClient.create()
        cloudFormationClient.createStack { it.templateBody(templateFile.toFile().readText()).stackName(stack) }
        cloudFormationClient.waiter().waitUntilStackCreateComplete { it.stackName(stack) }
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

            step("Open stack") {
                awsExplorer {
                    expandExplorerNode(cloudFormation)
                    doubleClickExplorer(cloudFormation, stack)
                }
            }
            step("Check events") {
                clickOn("Events")
                step("Assert that there are two CREATE_COMPLETE events shown") {
                    val createComplete = findAllText("CREATE_COMPLETE")
                    assertThat(createComplete).hasSize(2)
                    createComplete.first()
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
                step("Assert that the stack resource is there") {
                    val createComplete = findAllText("CREATE_COMPLETE")
                    assertThat(createComplete).hasSize(1)
                    createComplete.first()
                }
            }
            step("Delete stack $stack") {
                awsExplorer {
                    openExplorerActionMenu(cloudFormation, stack)
                }
                findAndClick("//div[@text='$deleteStackText']")
                fillDeletionAndConfirm()
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
        log.info("Running final cleanup")
        try {
            cloudFormationClient.deleteStack { it.stackName(stack) }
            waitForStackDeletion()
        } catch (e: Exception) {
            log.error("Delete stack threw an exception", e)
        } finally {
            cloudFormationClient.close()
        }
    }

    private fun IdeaFrame.clickOn(tab: String) {
        findAndClick("//div[@accessiblename='$tab' and @class='JLabel' and @text='$tab']")
    }

    private fun waitForStackDeletion() {
        log.info("Waiting for the deletion of stack $stack")
        if (cloudFormationClient.describeStacks { it.stackName(stack) }.hasStacks()) {
            cloudFormationClient.waiter().waitUntilStackDeleteComplete { it.stackName(stack) }
        }
        log.info("Finished deleting stack $stack")
    }
}
