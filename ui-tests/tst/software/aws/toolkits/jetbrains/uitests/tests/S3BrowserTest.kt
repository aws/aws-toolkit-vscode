// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.tests

import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.waitFor
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.TestInstance.Lifecycle
import org.junit.jupiter.api.io.TempDir
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.aws.toolkits.core.s3.deleteBucketAndContents
import software.aws.toolkits.jetbrains.uitests.CoreTest
import software.aws.toolkits.jetbrains.uitests.extensions.uiTest
import software.aws.toolkits.jetbrains.uitests.fixtures.IdeaFrame
import software.aws.toolkits.jetbrains.uitests.fixtures.JTreeFixture
import software.aws.toolkits.jetbrains.uitests.fixtures.actionButton
import software.aws.toolkits.jetbrains.uitests.fixtures.actionMenuItem
import software.aws.toolkits.jetbrains.uitests.fixtures.awsExplorer
import software.aws.toolkits.jetbrains.uitests.fixtures.clearSearchTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.fileBrowser
import software.aws.toolkits.jetbrains.uitests.fixtures.fillDeletionAndConfirm
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSearchTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.fillSingleTextField
import software.aws.toolkits.jetbrains.uitests.fixtures.findAndClick
import software.aws.toolkits.jetbrains.uitests.fixtures.idea
import software.aws.toolkits.jetbrains.uitests.fixtures.pressDelete
import software.aws.toolkits.jetbrains.uitests.fixtures.pressOk
import software.aws.toolkits.jetbrains.uitests.fixtures.waitUntilLoaded
import software.aws.toolkits.jetbrains.uitests.fixtures.welcomeFrame
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Duration
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

@Disabled("Needs to be moved to accomodate plugin split")
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
    private val newFolder = "New Folder..."
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
        s3Client = S3Client.builder().region(Region.US_WEST_2).build()
    }

    @Test
    @CoreTest
    fun testS3Browser() = uiTest {
        welcomeFrame {
            openFolder(tempDir)
        }
        idea {
            waitForBackgroundTasks()

            step("Create bucket named $bucket") {
                awsExplorer {
                    openExplorerActionMenu(S3)
                }
                actionMenuItem(createBucketText).click()
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
                    waitUntilLoaded()
                    findText(jsonFile2)
                }
            }

            step("Rename a file") {
                s3Tree {
                    waitUntilLoaded()
                    findText(jsonFile).click()
                }
                actionButton(rename).click()
                fillSingleTextField(newJsonName)
                pressOk()
                // Wait for the item to be renamed
                Thread.sleep(1000)
                s3Tree {
                    waitUntilLoaded()
                    findText(newJsonName)
                }
            }

            step("Filter by partial prefix") {
                fillSearchTextField("hello")
                s3Tree {
                    waitUntilLoaded()
                    assertThat(this.callJs<String>("component.rootNode.name")).isEqualTo("Prefix: hello")
                    assertThat(findAllText(folder)).isEmpty()
                    findText(newJsonName)
                }

                fillSearchTextField(folder)
                s3Tree {
                    waitUntilLoaded()
                    assertThat(this.callJs<String>("component.rootNode.name")).isEqualTo("Prefix: $folder")
                    findText(folder).doubleClick()
                    waitUntilLoaded()
                    findText(jsonFile2)
                    assertThat(findAllText(newJsonName)).isEmpty()
                }
            }

            step("Filter by delimited prefix") {
                fillSearchTextField("$folder/")
                s3Tree {
                    waitUntilLoaded()
                    assertThat(this.callJs<String>("component.rootNode.name")).isEqualTo("$folder/")
                    // no child with name equal to folder
                    assertThat(findAllText(folder)).isEmpty()
                    findText(jsonFile2)
                    assertThat(findAllText(newJsonName)).isEmpty()
                }
            }

            step("Clear filter") {
                clearSearchTextField()
                s3Tree {
                    waitUntilLoaded()
                    assertThat(this.callJs<String>("component.rootNode.name")).isEqualTo("")
                    // restore tree to original state
                    findText(folder).doubleClick()
                    findText(newJsonName)
                }
            }

            step("Delete a file") {
                s3Tree {
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
                    waitUntilLoaded()
                    assertThat(findAllText(jsonFile2)).isEmpty()
                }
            }

            step("Open known file-types") {
                s3Tree {
                    waitUntilLoaded()
                    findText(newJsonName).doubleClick()
                }

                waitFor {
                    findAll<ComponentFixture>(byXpath("//div[contains(@visible_text, '$newJsonName')]")).isNotEmpty()
                }
            }

            step("Delete bucket named $bucket") {
                awsExplorer {
                    openExplorerActionMenu(S3, bucket)
                }
                findAndClick("//div[@text='$deleteBucketText']")
                fillDeletionAndConfirm()
                waitForS3BucketDeletion()
            }
        }
    }

    @AfterAll
    fun cleanup() {
        log.info("Running final cleanup")
        try {
            s3Client.deleteBucketAndContents(bucket)
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
// TODO: This is consistently timing out starting 12/7
//        s3Client.waiter().waitUntilBucketNotExists(
//            { it.bucket(bucket) },
//            { it.maxAttempts(30) }
//        )
    }

    private fun waitForS3BucketCreation() {
        s3Client.waiter().waitUntilBucketExists { it.bucket(bucket) }
    }

    private fun IdeaFrame.s3Tree(func: (JTreeFixture.() -> Unit)) {
        find<JTreeFixture>(byXpath("//div[@class='S3TreeTable']"), Duration.ofSeconds(5)).apply(func)
    }
}
