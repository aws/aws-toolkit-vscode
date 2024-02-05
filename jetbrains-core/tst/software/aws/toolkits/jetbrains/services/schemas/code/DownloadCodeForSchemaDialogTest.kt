// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.schemas.model.SchemaVersionSummary
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.schemas.Schema
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.NotificationListenerRule
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk
import software.aws.toolkits.resources.message
import java.io.File
import java.util.concurrent.CompletableFuture.completedFuture
import java.util.concurrent.CompletableFuture.failedFuture
import java.util.function.Function

class DownloadCodeForSchemaDialogTest {

    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val notificationListener = NotificationListenerRule(projectRule, disposableRule.disposable)

    private lateinit var fileEditorManager: FileEditorManager

    private val schemaCodeDownloader = mock<SchemaCodeDownloader>()

    @Before
    fun setup() {
        fileEditorManager = FileEditorManager.getInstance(projectRule.project)

        mockSchemaVersions()
    }

    @After
    fun cleanUp() {
        runInEdtAndWait {
            fileEditorManager.openFiles.forEach { fileEditorManager.closeFile(it) }
        }
    }

    @Test
    fun versionComboIncludesLatestVersionFirst() {
        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)

            assertThat(dialog.view.version.itemCount).isEqualTo(VERSIONS.size + 1)
            assertThat(dialog.latestVersion).isEqualTo(LATEST)
            assertThat(dialog.view.version.selectedItem).isEqualTo(DownloadCodeForSchemaDialog.LATEST_VERSION)
        }

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.ERROR }
            .isEmpty()

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.INFORMATION }
            .isEmpty()
    }

    @Test
    fun languageComboDetectsJavaRuntime() {
        initJavaSdk()

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)

            assertThat(dialog.view.language.selectedItem).isEqualTo(SchemaCodeLangs.JAVA8)
        }

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.ERROR }
            .isEmpty()

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.INFORMATION }
            .isEmpty()
    }

    @Test
    fun languageComboDetectsPythonRuntime() {
        initPythonSdk()

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)

            assertThat(dialog.view.language.selectedItem).isEqualTo(SchemaCodeLangs.PYTHON3_6)
        }

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.ERROR }
            .isEmpty()

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.INFORMATION }
            .isEmpty()
    }

    @Test
    fun okActionTriggersDownloaderFileOpenInEditorAndSuccessNotification() {
        initJavaSdk()

        val newFolder = tempFolder.newFolder()
        val testFile = File(newFolder, "test123")
        testFile.createNewFile()
        testFile.writeText("test123")
        val fileName = testFile.name

        schemaCodeDownloader.stub {
            on { downloadCode(any(), any()) }.thenReturn(completedFuture(testFile.toPath()))
        }

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)
            selectDialogDefaults(dialog, newFolder.absolutePath)

            dialog.downloadSchemaCode(schemaCodeDownloader)
        }

        val request = SchemaCodeDownloadRequestDetails(SchemaSummary(SCHEMA_NAME, REGISTRY), VERSION, LANGUAGE, newFolder)
        verify(schemaCodeDownloader).downloadCode(eq(request), any())
        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(fileName) }

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.ERROR }
            .isEmpty()

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.INFORMATION }
            .extracting(Function { t -> t.content })
            .containsOnly(
                message("schemas.schema.download_code_bindings.notification.start", SCHEMA_NAME),
                message("schemas.schema.download_code_bindings.notification.finished", SCHEMA_NAME)
            )
    }

    @Test
    fun downloaderExceptionsShown() {
        initJavaSdk()

        val newFolder = tempFolder.newFolder()

        val exception = SchemaCodeDownloadFileCollisionException(SCHEMA_NAME)

        schemaCodeDownloader.stub {
            on { downloadCode(any(), any()) }.thenReturn(failedFuture(exception))
        }

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)
            selectDialogDefaults(dialog, newFolder.absolutePath)

            dialog.downloadSchemaCode(schemaCodeDownloader)
        }

        assertThat(fileEditorManager.openFiles.size).isEqualTo(0)

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.ERROR }
            .extracting(Function { t -> t.content })
            .containsOnly(exception.message)

        assertThat(notificationListener.notifications)
            .filteredOn { it.type == NotificationType.INFORMATION }
            .extracting(Function { t -> t.content })
            .containsOnly(message("schemas.schema.download_code_bindings.notification.start", SCHEMA_NAME))
    }

    private fun selectDialogDefaults(
        dialog: DownloadCodeForSchemaDialog,
        path: String
    ) {
        dialog.view.location.text = path
        dialog.view.version.selectedItem = VERSION
        dialog.view.language.selectedItem = LANGUAGE
    }

    private fun initJavaSdk() {
        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(projectRule.project).projectSdk = sdk
            }
        }
    }

    private fun initPythonSdk() {
        val sdk = PyTestSdk.create("3.7.0")
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(projectRule.project).projectSdk = sdk
            }
        }
    }

    private fun mockSchemaVersions() {
        resourceCache.addEntry(
            projectRule.project,
            SchemasResources.getSchemaVersions(REGISTRY, SCHEMA_NAME),
            completedFuture(
                VERSIONS.map { v ->
                    SchemaVersionSummary.builder()
                        .schemaName(SCHEMA_NAME)
                        .schemaVersion(v)
                        .build()
                }
            )
        )
    }

    private companion object {
        private const val REGISTRY = "registry"
        private const val SCHEMA_NAME = "schema"
        private val SCHEMA = Schema(SCHEMA_NAME, REGISTRY, null)
        private const val VERSION = "4"
        private const val LATEST = "5"
        private val VERSIONS = listOf("3", VERSION, LATEST)
        private val LANGUAGE = SchemaCodeLangs.JAVA8
    }
}
