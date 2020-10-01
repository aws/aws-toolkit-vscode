// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

/* TODO uncomment to enable SQS
import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueDoesNotExistException
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry
import software.aws.toolkits.core.utils.Waiters.waitUntilBlocking
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.DialogFixture
import software.aws.toolkits.jetbrains.uitests.fixtures.JTreeFixture
import software.aws.toolkits.jetbrains.uitests.fixtures.NewProjectWizardDialog
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.fillAllJBTextFields
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleJBTextArea
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.findByXpath
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.pressCreate
import software.aws.toolkits.jetbrains.uitests.fixtures.pressOk
import software.aws.toolkits.jetbrains.uitests.fixtures.pressSave
import software.aws.toolkits.jetbrains.uitests.fixtures.pressYes
import software.aws.toolkits.jetbrains.uitests.fixtures.rightClick
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.nio.file.Path
import java.time.Duration
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SQSTest {
    @TempDir
    lateinit var tempDir: Path

    private val sqsNodeLabel = "SQS"
    private val createQueueText = "Create Queue..."
    private val deleteQueueText = "Delete Queue..."
    private val purgeQueueText = "Purge Queue..."
    private val editQueueAttributesAction = "Edit Queue Attributes..."
    private val editQueueAttributesTitle = "Edit Queue Attributes"

    private val queueName = "uitest-${UUID.randomUUID()}"
    private val fifoQueueName = "fifouitest-${UUID.randomUUID()}.fifo"

    @Test
    @CoreTest
    fun testSqs() = uiTest {
        val client = SqsClient.create()
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()
            showAwsExplorer()
        }
        idea {
            step("Create queues") {
                step("Create queue $queueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel)
                    }
                    find<ComponentFixture>(byXpath("//div[@text='$createQueueText']")).click()
                    fillSingleTextField(queueName)
                    find<ComponentFixture>(byXpath("//div[@accessiblename='Standard']")).click()
                    pressCreate()
                    client.waitForCreation(queueName)
                }
                step("Create FIFO queue $fifoQueueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel)
                    }
                    find<ComponentFixture>(byXpath("//div[@text='$createQueueText']")).click()
                    fillSingleTextField(fifoQueueName.substringBefore(".fifo"))
                    find<ComponentFixture>(byXpath("//div[@accessiblename='FIFO']")).click()
                    pressCreate()
                    client.waitForCreation(fifoQueueName)
                }
            }
            val queueUrl = client.getQueueUrl { it.queueName(queueName) }.queueUrl()
            step("Expand SQS node") { awsExplorer { expandExplorerNode(sqsNodeLabel) } }
            step("Standard queue") {
                openSendMessagePane(queueName)
                step("Send a message and validate it is sent") {
                    fillSingleJBTextArea("message")
                    findAndClick("//div[@text='Send']")
                    // Make sure it shows a sent message
                    findByXpath("//div[contains(@accessiblename, 'Sent message ID')]")
                }
                step("Add 10 messages to the queue so poll will be guaranteed to work") {
                    client.sendMessageBatch {
                        it.queueUrl(queueUrl).entries(
                            (1..10).map { num ->
                                SendMessageBatchRequestEntry.builder().messageBody("bmessage$num").id(num.toString()).build()
                            }
                        )
                    }
                }
                openPollMessagePane(queueName)
                step("View messages") {
                    findAndClick("//div[@accessiblename='View Messages' and @class='JButton']")
                    // Wait for the table to be populated (It's very fast for small queues)
                    Thread.sleep(1000)
                    assertThat(find<JTreeFixture>(byXpath("//div[@class='TableView']")).findAllText()).anySatisfy {
                        assertThat(it.text).contains("bmessage")
                    }
                }
            }
            closeToolWindowTab()
            step("FIFO queue") {
                openSendMessagePane(fifoQueueName)
                step("Send a message and validate it is sent") {
                    // fill the message box
                    fillSingleJBTextArea("message")
                    // Fill the rest of the fields (deduplication and group ids)
                    fillAllJBTextFields("message")
                    findAndClick("//div[@text='Send']")
                    // Make sure it shows a sent message
                    findByXpath("//div[contains(@accessiblename, 'Sent message ID')]")
                }
            }
            closeToolWindowTab()
            step("Edit queue attributes") {
                awsExplorer { openExplorerActionMenu(sqsNodeLabel, queueName) }
                findAndClick("//div[@text='$editQueueAttributesAction']")
                val dialog = find<NewProjectWizardDialog>(DialogFixture.byTitle(editQueueAttributesTitle))
                // Change visibility timeout to a different value
                find<JTextFieldFixture>(byXpath("//div[@class='JTextField' and @visible_text='30']")).text = "24"
                dialog.pressSave()
                assertThat(findToast().hasText { it.text.contains("Updated queue attributes") })
                // Reopen the dialog to make sure the new value was saved
                awsExplorer { openExplorerActionMenu(sqsNodeLabel, queueName) }
                findAndClick("//div[@text='$editQueueAttributesAction']")
                val updatedDialog = find<NewProjectWizardDialog>(DialogFixture.byTitle(editQueueAttributesTitle))
                find<JTextFieldFixture>(byXpath("//div[@class='JTextField' and @visible_text='24']"))
                updatedDialog.close()
            }
            step("Purge queue") {
                awsExplorer {
                    openExplorerActionMenu(sqsNodeLabel, queueName)
                }
                findAndClick("//div[@text='$purgeQueueText']")
                pressYes()
                assertThat(findToast().hasText { it.text.contains("Started purging queue") })
                awsExplorer {
                    openExplorerActionMenu(sqsNodeLabel, queueName)
                }
                findAndClick("//div[@text='$purgeQueueText']")
                pressYes()
                assertThat(findToast().hasText { it.text.contains("Purge queue request already in progress for queue") })
            }
            step("Delete queues") {
                step("Delete queue $queueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, queueName)
                    }
                    findAndClick("//div[@accessiblename='$deleteQueueText']")
                    fillSingleTextField(queueName)
                    pressOk()
                    client.waitForDeletion(queueName)
                }
                step("Delete queue $fifoQueueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, fifoQueueName)
                    }
                    findAndClick("//div[@accessiblename='$deleteQueueText']")
                    fillSingleTextField(fifoQueueName)
                    pressOk()
                    client.waitForDeletion(fifoQueueName)
                }
            }
        }
    }

    @AfterAll
    // Make sure the two queues are deleted, and if not, delete them
    fun cleanup() {
        var client: SqsClient? = null
        try {
            client = SqsClient.create()
            client.verifyDeleted(queueName)
            client.verifyDeleted(fifoQueueName)
        } catch (e: Exception) {
            log.error("Unable to verify the queues were removed", e)
        } finally {
            client?.close()
        }
    }

    private fun RemoteRobot.openSendMessagePane(queueName: String) = step("Open send message pane") {
        awsExplorer {
            openExplorerActionMenu(sqsNodeLabel, queueName)
        }
        find<ComponentFixture>(byXpath("//div[@accessiblename='Send a Message']")).click()
    }

    // If we don't do this, it fails to find the entry in the explorer
    private fun RemoteRobot.closeToolWindowTab() = step("Close tool window so the robot can see the queues in the explorer") {
        val firstTab = findAll(ComponentFixture::class.java, byXpath("//div[contains(@accessiblename, 'uitest') and @class='ContentTabLabel']")).first()
        firstTab.rightClick()
        find<ComponentFixture>(byXpath("//div[@accessiblename='Close Tab' and @class='ActionMenuItem' and @text='Close Tab']")).click()
    }

    private fun RemoteRobot.openPollMessagePane(queueName: String) = step("Open view message pane") {
        awsExplorer {
            openExplorerActionMenu(sqsNodeLabel, queueName)
        }
        find<ComponentFixture>(byXpath("//div[@accessiblename='View Messages']")).click()
    }

    private fun SqsClient.verifyDeleted(queueName: String) {
        val queueUrl = try {
            getQueueUrl { it.queueName(queueName) }.queueUrl()
        } catch (e: QueueDoesNotExistException) {
            log.info("Queue $queueName is deleted")
            return
        } catch (e: Exception) {
            log.error("Get queue URL returned an error, cannot attempt deletion again", e)
            return
        }
        log.info("Deleting $queueUrl")
        try {
            deleteQueue { it.queueUrl(queueUrl) }
        } catch (e: Exception) {
            log.error("Trying to delete $queueUrl threw an exception, it might not be deleted!", e)
            return
        }

        waitForDeletion(queueName)
    }

    private fun SqsClient.waitForDeletion(queueName: String) {
        try {
            waitUntilBlocking(exceptionsToStopOn = setOf(QueueDoesNotExistException::class)) {
                getQueueUrl { it.queueName(queueName) }
            }
            log.info("Verified $queueName is deleted")
        } catch (e: Exception) {
            log.error("Unknown exception thrown by waitForDeletion", e)
        }
    }

    private fun SqsClient.waitForCreation(queueName: String) {
        try {
            // getQueueUrl can get before list works, so we can't use it to check if it exists.
            // So, use getQueuesPaginator instead. This can also take more than 1 minute sometimes,
            // so give it a 5 min timeout
            waitUntilBlocking(succeedOn = { it }, maxDuration = Duration.ofMinutes(5)) {
                listQueuesPaginator().queueUrls().toList().any {
                    it.contains(queueName)
                }
            }
            log.info("Verified $queueName is created")
        } catch (e: Exception) {
            log.error("Unknown exception thrown by waitForDeletion", e)
        }
    }
}
*/
