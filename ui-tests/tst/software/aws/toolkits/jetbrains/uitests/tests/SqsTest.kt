// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.JTableFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.condition.DisabledIfSystemProperty
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.services.sns.SnsClient
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.QueueDoesNotExistException
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.IdeaFrame
import software.aws.toolkits.jetbrains.uitests.fixtures.actionMenuItem
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.dialog
import software.aws.toolkits.jetbrains.uitests.fixtures.fillAllJBTextFields
import software.aws.toolkits.jetbrains.uitests.fixtures.fillDeletionAndConfirm
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleJBTextArea
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.findByXpath
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.pressCreate
import software.aws.toolkits.jetbrains.uitests.fixtures.pressSave
import software.aws.toolkits.jetbrains.uitests.fixtures.pressYes
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import software.aws.toolkits.jetbrains.uitests.utils.reattemptAssert
import software.aws.toolkits.jetbrains.uitests.utils.recheckAssert
import java.nio.file.Path
import java.time.Duration
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@DisabledIfSystemProperty(named = "org.gradle.project.ideProfileName", matches = "202*.*", disabledReason = "Flakes on 231 above")
class SqsTest {
    @TempDir
    lateinit var tempDir: Path

    private val sqsNodeLabel = "SQS"
    private val createQueueText = "Create Queue..."
    private val deleteQueueText = "Delete Queue..."
    private val purgeQueueText = "Purge Queue..."
    private val subscribeToSnsText = "Subscribe to SNS topic..."
    private val editQueueAttributesAction = "Edit Queue Parameters..."
    private val editQueueAttributesTitle = "Edit Queue Parameters"

    private val queueName = "uitest-${UUID.randomUUID()}"
    private val snsTopicName = "uitest-${UUID.randomUUID()}"
    private var snsTopicArn = ""
    private val fifoQueueName = "fifouitest-${UUID.randomUUID()}.fifo"

    @Test
    @CoreTest
    fun testSqs() = uiTest {
        val snsClient = SnsClient.create()
        val client = SqsClient.create()
        snsTopicArn = snsClient.createTopic { it.name(snsTopicName) }.topicArn()
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()

            step("Create queues") {
                step("Create queue $queueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel)
                    }
                    actionMenuItem(createQueueText).click()
                    fillSingleTextField(queueName)
                    find<ComponentFixture>(byXpath("//div[@accessiblename='Standard']")).click()
                    pressCreate()
                    client.waitForCreation(queueName)
                }
                step("Create FIFO queue $fifoQueueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel)
                    }
                    actionMenuItem(createQueueText).click()
                    fillSingleTextField(fifoQueueName.substringBefore(".fifo"))
                    find<ComponentFixture>(byXpath("//div[@accessiblename='FIFO']")).click()
                    pressCreate()
                    client.waitForCreation(fifoQueueName)
                }
            }

            step("Expand SQS node") { awsExplorer { expandExplorerNode(sqsNodeLabel) } }

            val queueUrl = client.getQueueUrl { it.queueName(queueName) }.queueUrl()

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
                    recheckAssert(timeout = Duration.ofSeconds(10)) {
                        assertThat(find<JTableFixture>(byXpath("//div[@class='TableView']")).findAllText()).anySatisfy {
                            assertThat(it.text).contains("bmessage")
                        }
                    }
                }
            }

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

            step("Edit queue parameters") {
                step("Open queue parameters and change visibility to a different value") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, queueName)
                    }
                    actionMenuItem(editQueueAttributesAction).click()
                    dialog(editQueueAttributesTitle) {
                        step("change visibility") {
                            find<JTextFieldFixture>(byXpath("//div[@class='JTextField' and @visible_text='30']")).text = "24"
                            pressSave()
                        }
                    }
                }

                assertThat(findToastText()).anySatisfy {
                    assertThat(it).contains("Updated queue parameters")
                }

                step("Reopen the dialog to make sure the new value was saved") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, queueName)
                    }
                    actionMenuItem(editQueueAttributesAction).click()
                    dialog(editQueueAttributesTitle) {
                        find<JTextFieldFixture>(byXpath("//div[@class='JTextField' and @visible_text='24']"))
                        close()
                    }
                }
            }

            step("Purge queue") {
                awsExplorer {
                    openExplorerActionMenu(sqsNodeLabel, queueName)
                }
                actionMenuItem(purgeQueueText).click()
                pressYes()
                reattemptAssert {
                    assertThat(findToastText()).anySatisfy {
                        assertThat(it).contains("Started purging queue")
                    }
                }
            }
            step("Subscribe queue to sns topic") {
                awsExplorer {
                    openExplorerActionMenu(sqsNodeLabel, queueName)
                }
                actionMenuItem(subscribeToSnsText).click()
                // Wait for the resource selector to load, we don't have a visual cue for this
                Thread.sleep(2000)
                comboBox(byXpath("//div[@class='ResourceSelector']")).selectItemContains(snsTopicName)
                step("Press subscribe") {
                    findAndClick("//div[@class='JButton' and @text='Subscribe']")
                }
                step("Add the policy") {
                    findAndClick("//div[@class='JButton' and @text='Add Policy']")
                }
                reattemptAssert {
                    assertThat(findToastText()).anySatisfy {
                        assertThat(it).contains("Subscribed successfully to topic")
                    }
                }
                step("Subscribe again, policy should not show again") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, queueName)
                    }
                    actionMenuItem(subscribeToSnsText).click()
                    comboBox(byXpath("//div[@class='ResourceSelector']")).selectItemContains(snsTopicName)
                    step("Press subscribe") {
                        findAndClick("//div[@class='JButton' and @text='Subscribe']")
                    }
                    reattemptAssert {
                        assertThat(findToastText()).anySatisfy {
                            assertThat(it).contains("Subscribed successfully to topic")
                        }
                    }
                }
            }

            step("Delete queues") {
                step("Delete queue $queueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, queueName)
                    }
                    actionMenuItem(deleteQueueText).click()
                    fillDeletionAndConfirm()
                    client.waitForDeletion(queueName)
                }
                step("Delete queue $fifoQueueName") {
                    awsExplorer {
                        openExplorerActionMenu(sqsNodeLabel, fifoQueueName)
                    }
                    actionMenuItem(deleteQueueText).click()
                    fillDeletionAndConfirm()
                    client.waitForDeletion(fifoQueueName)
                }
            }
        }
    }

    @AfterAll
    // Make sure the two queues and sns topic are deleted, and if not, delete them
    fun cleanup() {
        log.info("Running final cleanup")
        try {
            SqsClient.create().use { client ->
                client.verifyDeleted(queueName)
                client.verifyDeleted(fifoQueueName)
            }
        } catch (e: Exception) {
            log.error("Unable to verify the queues were removed", e)
        }
        try {
            SnsClient.create().use { client ->
                client.deleteTopic { it.topicArn(snsTopicArn) }
            }
            log.info("Deleted sns topic $snsTopicArn")
        } catch (e: Exception) {
            log.error("Unable to verify the topic was removed", e)
        }
    }

    private fun IdeaFrame.openSendMessagePane(queueName: String) = step("Open send message pane") {
        awsExplorer {
            openExplorerActionMenu(sqsNodeLabel, queueName)
            actionMenuItem("Send a Message").click()
        }
    }

    private fun IdeaFrame.openPollMessagePane(queueName: String) = step("Open view message pane") {
        awsExplorer {
            openExplorerActionMenu(sqsNodeLabel, queueName)
        }
        actionMenuItem("View Messages").click()
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

    private fun SqsClient.waitForDeletion(queueName: String) = runBlocking {
        try {
            withTimeout(Duration.ofMinutes(5).toMillis()) {
                while (true) {
                    delay(2000)
                    try {
                        getQueueUrl { it.queueName(queueName) }
                    } catch (e: QueueDoesNotExistException) {
                        return@withTimeout
                    } catch (_: Exception) {
                    }
                }
            }
            log.info("Verified $queueName is deleted")
        } catch (e: Exception) {
            log.error("Exception thrown by waitForDeletion", e)
        }
    }

    private fun SqsClient.waitForCreation(queueName: String) = runBlocking {
        try {
            // getQueueUrl can get before list works, so we can't use it to check if it exists.
            // So, use getQueuesPaginator instead. This can also take more than 1 minute sometimes,
            // so give it a 5 min timeout
            withTimeout(Duration.ofMinutes(5).toMillis()) {
                while (true) {
                    delay(2000)
                    try {
                        if (listQueuesPaginator().queueUrls().toList().any { it.contains(queueName) }) {
                            return@withTimeout
                        }
                    } catch (_: Exception) {
                    }
                }
            }
            log.info("Verified $queueName is created")
        } catch (e: Exception) {
            log.error("Exception thrown by waitForDeletion", e)
        }
    }
}
