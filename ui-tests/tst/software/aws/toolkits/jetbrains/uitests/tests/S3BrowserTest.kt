// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.TestInstance.Lifecycle
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.JTreeFixture
import software.aws.toolkits.jetbrains.uitests.fixtures.actionButton
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.fileBrowser
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.pressDelete
import software.aws.toolkits.jetbrains.uitests.fixtures.pressOk
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Duration
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

@TestInstance(Lifecycle.PER_CLASS)
class S3BrowserTest {
    private val testDataPath: Path = Paths.get(System.getProperty("testDataPath"))

    private val date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
    private val bucket = "uitest-$date-${UUID.randomUUID()}"
    private val folder = UUID.randomUUID().toString()

    private val S3 = "S3"
    private val createBucketText = "Create S3 Bucket"
    private val deleteBucketText = "Delete S3 Bucket"
    private val upload = "Upload..."
    private val newFolder = "New folder..."
    private val rename = "Rename..."
    private val delete = "Delete..."

    private val jsonFile = "hello.json"
    private val jsonFile2 = "hello2.json"
    private val newJsonName = "helloooooooooo.json"

    @TempDir
    lateinit var tempDir: Path
    lateinit var s3Client: S3Client

    @BeforeAll
    fun setUp() {
        s3Client = S3Client.create()
    }

    @Test
    @CoreTest
    fun testS3Browser() = uiTest {
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()
            showAwsExplorer()

            step("Create bucket named $bucket") {
                awsExplorer {
                    openExplorerActionMenu(S3)
                }
                find<ComponentFixture>(byXpath("//div[@text='$createBucketText']")).click()
                find<JTextFieldFixture>(byXpath("//div[@class='JTextField']"), Duration.ofSeconds(5)).text = bucket
                find<ComponentFixture>(byXpath("//div[@text='Create']")).click()
            }

            waitForS3BucketCreation()

            awsExplorer {
                step("Open editor for bucket $bucket") {
                    expandExplorerNode(S3)
                    doubleClickExplorer(S3, bucket)
                }
            }

            // Click on the tree to make sure it's there + we aren't selecting anything else
            s3Tree { click() }

            // If the project starts fast enough we start the test before the tip is shown, but if the tip is showing when we go to start using the file browser
            // it will fail to find them. So check for it one last time.
            tryCloseTips()

            step("Upload object to top-level") {
                actionButton(upload).click()
                fileBrowser("Select") {
                    selectFile(testDataPath.resolve("testFiles").resolve(jsonFile))
                }
                // Wait for the item to be uploaded
                Thread.sleep(1000)
                s3Tree {
                    findText(jsonFile)
                }
            }

            step("Create folder") {
                actionButton(newFolder).click()
                fillSingleTextField(folder)
                pressOk()
                // Wait for the folder to be created
                Thread.sleep(1000)
                s3Tree {
                    findText(folder)
                }
            }

            step("Upload object to folder") {
                // TODO have to use findText instead of the reasonable clickRow or clickPath because
                // it can't find anything for some reason
                s3Tree {
                    findText(folder).click()
                }
                actionButton(upload).click()
                fileBrowser("Select") {
                    selectFile(testDataPath.resolve("testFiles").resolve(jsonFile2))
                }
                // Wait for the item to be uploaded
                Thread.sleep(1000)
                s3Tree {
                    findText(folder).doubleClick()
                    findText(jsonFile2)
                }
            }

            step("Rename a file") {
                s3Tree {
                    findText(jsonFile).click()
                }
                actionButton(rename).click()
                fillSingleTextField(newJsonName)
                pressOk()
                // Wait for the item to be renamed
                Thread.sleep(1000)
                s3Tree {
                    findText(newJsonName)
                }
            }

            step("Delete a file") {
                s3Tree {
                    // Reopen the folder
                    findText(folder).doubleClick()
                    findText(jsonFile2).click()
                }
                actionButton(delete).click()
                pressDelete()
                // Wait for the item to be deleted
                Thread.sleep(1000)
                // make sure it's gone
                s3Tree {
                    // Attempt to reopen the folder
                    findText(folder).doubleClick()
                    assertThat(findAllText(jsonFile2)).isEmpty()
                }
            }

            step("Open known file-types") {
                s3Tree {
                    findText(newJsonName).doubleClick()
                }
                // Wait for the item to download and open
                Thread.sleep(1000)
                // Find the title bar
                assertThat(findAll<ComponentFixture>(byXpath("//div[@accessiblename='$newJsonName']"))).isNotEmpty
            }

            step("Delete bucket named $bucket") {
                showAwsExplorer()
                awsExplorer {
                    openExplorerActionMenu(S3, bucket)
                }
                findAndClick("//div[@text='$deleteBucketText']")
                fillSingleTextField(bucket)
                pressOk()
                waitForS3BucketDeletion()
            }
        }
    }

    @AfterAll
    fun cleanup() {
        try {
            s3Client.deleteBucket { it.bucket(bucket) }
            waitForS3BucketDeletion()
        } catch (e: Exception) {
            if (e is NoSuchBucketException) {
                return
            }
            log.error("Delete bucket stack threw an exception", e)
        } finally {
            s3Client.close()
        }
    }

    private fun waitForS3BucketDeletion() {
        s3Client.waiter().waitUntilBucketNotExists { it.bucket(bucket) }
    }

    private fun waitForS3BucketCreation() {
        s3Client.waiter().waitUntilBucketExists { it.bucket(bucket) }
    }

    private fun RemoteRobot.s3Tree(func: (JTreeFixture.() -> Unit)) {
        find<JTreeFixture>(byXpath("//div[@class='S3TreeTable']"), Duration.ofSeconds(5)).apply(func)
    }
}
