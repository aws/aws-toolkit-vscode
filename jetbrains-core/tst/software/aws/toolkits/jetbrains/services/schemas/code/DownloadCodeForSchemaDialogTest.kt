// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.services.schemas.model.SchemaVersionSummary
import software.aws.toolkits.core.utils.failedFuture
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.schemas.Schema
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.PyTestSdk
import software.aws.toolkits.resources.message
import java.io.File
import java.util.concurrent.CompletableFuture.completedFuture

class DownloadCodeForSchemaDialogTest {

    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private lateinit var fileEditorManager: FileEditorManager
    private lateinit var mockSettingsManager: MockProjectAccountSettingsManager

    private var infoNotification: Notification? = null
    private var errorNotification: Notification? = null

    private val REGISTRY = "registry"
    private val SCHEMA_NAME = "schema"
    private val SCHEMA = Schema(SCHEMA_NAME, REGISTRY, null)
    private val VERSION = "4"
    private val LATEST = "5"
    private val VERSIONS = listOf("3", VERSION, LATEST)
    private val LANGUAGE = SchemaCodeLangs.JAVA8

    private val schemaCodeDownloader = mock<SchemaCodeDownloader>()

    @Before
    fun setup() {
        fileEditorManager = FileEditorManager.getInstance(projectRule.project)
        mockSettingsManager = ProjectAccountSettingsManager.getInstance(projectRule.project) as MockProjectAccountSettingsManager

        resourceCache().mockSchemaVersions(
            REGISTRY, SCHEMA_NAME, VERSIONS
        )

        subscribeToNotifications()
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

        assertThat(errorNotification?.content).isNull()
        assertThat(infoNotification?.content).isNull()
    }

    @Test
    fun languageComboDetectsJavaRuntime() {
        initJavaSdk()

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)

            assertThat(dialog.view.language.selectedItem).isEqualTo(SchemaCodeLangs.JAVA8)
        }

        assertThat(errorNotification?.content).isNull()
        assertThat(infoNotification?.content).isNull()
    }

    @Test
    fun languageComboDetectsPythonRuntime() {
        initPythonSdk()

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)

            assertThat(dialog.view.language.selectedItem).isEqualTo(SchemaCodeLangs.PYTHON3_6)
        }

        assertThat(errorNotification?.content).isNull()
        assertThat(infoNotification?.content).isNull()
    }

    @Test
    fun okActionTriggersDownloaderFileOpenInEditorAndSuccessNotification() {
        initJavaSdk()

        val newFolder = tempFolder.newFolder()
        val testFile = File(newFolder.path + File.separator + "test123")
        testFile.createNewFile()
        testFile.writeText("test123")
        val fileName = testFile.name

        val path = newFolder.absolutePath

        schemaCodeDownloader.stub {
            on { downloadCode(any(), any()) }.thenReturn(completedFuture(testFile))
        }

        runInEdtAndWait {
            val dialog = DownloadCodeForSchemaDialog(projectRule.project, SCHEMA)
            selectDialogDefaults(dialog, path)

            dialog.downloadSchemaCode(schemaCodeDownloader)
        }

        val request = SchemaCodeDownloadRequestDetails(SchemaSummary(SCHEMA_NAME, REGISTRY), VERSION, LANGUAGE, path)
        verify(schemaCodeDownloader).downloadCode(eq(request), any())
        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(fileName) }

        assertThat(errorNotification?.content).isNull()
        assertThat(infoNotification?.content).isEqualTo(message("schemas.schema.download_code_bindings.notification.finished", SCHEMA_NAME))
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

        assertThat(errorNotification?.content).isEqualTo(exception.message)
        assertThat(infoNotification?.content).isEqualTo(message("schemas.schema.download_code_bindings.notification.start", SCHEMA_NAME))
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
        val sdk = PyTestSdk("3.7.0")
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(projectRule.project).projectSdk = sdk
            }
        }
    }

    private fun subscribeToNotifications() {
        val project = projectRule.project

        val messageBus = project.messageBus.connect()

        messageBus.setDefaultHandler { _, params ->
            val notification = params[0] as Notification
            if (notification.type == NotificationType.INFORMATION) {
                infoNotification = notification
            } else {
                errorNotification = notification
            }
        }
        messageBus.subscribe(Notifications.TOPIC)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.mockSchemaVersions(registryName: String, schemaName: String, schemaVersions: List<String>) {
        this.addEntry(
            SchemasResources.getSchemaVersions(registryName, schemaName),
            completedFuture(schemaVersions.map { v ->
                SchemaVersionSummary.builder()
                    .schemaName(schemaName)
                    .schemaVersion(v)
                    .build()
            })
        )
    }
}
