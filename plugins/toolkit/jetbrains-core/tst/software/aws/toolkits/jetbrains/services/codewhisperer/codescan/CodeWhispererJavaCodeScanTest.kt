// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.compiler.CompilerTestUtil
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.projectRoots.impl.SdkConfigurationUtil
import com.intellij.openapi.roots.CompilerProjectExtension
import com.intellij.openapi.roots.ModuleRootModificationUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import software.aws.toolkits.jetbrains.core.compileProjectAndWait
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.io.File
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererJavaCodeScanTest : CodeWhispererCodeScanTestBase(HeavyJavaCodeInsightTestFixtureRule()) {
    private lateinit var utilsJava: VirtualFile
    private lateinit var test1Java: VirtualFile
    private lateinit var test2Java: VirtualFile
    private lateinit var moduleFile: VirtualFile
    private lateinit var sessionConfigSpy: CodeScanSessionConfig
    private lateinit var sessionConfigSpy2: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupJavaProject()
        sessionConfigSpy = spy(CodeScanSessionConfig.create(utilsJava, project, CodeWhispererConstants.SecurityScanType.PROJECT))
        setupResponse(utilsJava.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        sessionConfigSpy2 = spy(CodeScanSessionConfig.create(utilsJava, project, CodeWhispererConstants.SecurityScanType.FILE))
        setupResponse(utilsJava.toNioPath().relativeTo(sessionConfigSpy2.projectRoot.toNioPath()))

        mockClient.stub {
            onGeneric { createUploadUrl(any()) }.thenReturn(fakeCreateUploadUrlResponse)
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponse)
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponse)
            onGeneric { listCodeScanFindings(any(), any()) }.thenReturn(fakeListCodeScanFindingsResponse)
        }
    }

    @Test
    fun `test createPayload`() {
        val payload = sessionConfigSpy.createPayload()
        assertThat(payload.context.totalFiles).isEqualTo(4)

        assertThat(payload.context.scannedFiles.size).isEqualTo(4)
        assertThat(payload.context.scannedFiles).containsExactly(utilsJava, test1Java, test2Java, moduleFile)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Java)
        assertThat(payload.context.totalLines).isEqualTo(totalLines)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }
        assertThat(filesInZip).isEqualTo(4)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        getSourceFilesUnderProjectRoot(sessionConfigSpy, utilsJava, 4)
    }

    @Test
    fun `test getSourceFilesUnderProjectRootForFileScan`() {
        getSourceFilesUnderProjectRootForFileScan(sessionConfigSpy2, utilsJava)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 4, totalSize, this.totalLines, 0)
    }

    @Test
    fun `test getTotalProjectSizeInBytes()`() {
        getTotalProjectSizeInBytes(sessionConfigSpy, totalSize)
    }

    @Test
    fun `selected file larger than payload limit throws exception`() {
        selectedFileLargerThanPayloadSizeThrowsException(sessionConfigSpy)
    }

    @Test
    fun `test createPayload with custom payload limit`() {
        sessionConfigSpy.stub {
            onGeneric { getPayloadLimitInBytes() }.thenReturn(900)
        }
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(sessionConfigSpy.isProjectTruncated()).isTrue
        assertThat(payload.context.totalFiles).isEqualTo(1)

        assertThat(payload.context.scannedFiles.size).isEqualTo(1)
        assertThat(payload.context.scannedFiles).containsExactly(utilsJava)

        assertThat(payload.context.srcPayloadSize).isEqualTo(346)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Java)
        assertThat(payload.context.totalLines).isEqualTo(16)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }
        assertThat(filesInZip).isEqualTo(1)
    }

    @Test
    fun `e2e happy path integration test`() {
        assertE2ERunsSuccessfully(sessionConfigSpy, project, totalLines, 4, totalSize, 2)
    }

    private fun compileProject() {
        setUpCompiler()
        compileProjectAndWait(project)
    }

    private fun setUpCompiler() {
        val modules = ModuleManager.getInstance(project).modules

        WriteCommandAction.writeCommandAction(project).run<Nothing> {
            val compilerExtension = CompilerProjectExtension.getInstance(project)
            assertNotNull(compilerExtension)
            compilerExtension.compilerOutputUrl = projectRule.fixture.tempDirFixture.findOrCreateDir("out").url
            val jdkHome = IdeaTestUtil.requireRealJdkHome()
            VfsRootAccess.allowRootAccess(projectRule.fixture.testRootDisposable, jdkHome)
            val jdkHomeDir = LocalFileSystem.getInstance().refreshAndFindFileByPath(jdkHome)
            assertNotNull(jdkHomeDir)
            val jdkName = "Real JDK"
            val jdk = SdkConfigurationUtil.setupSdk(emptyArray(), jdkHomeDir, JavaSdk.getInstance(), false, null, jdkName)
            assertNotNull(jdk)
            ProjectJdkTable.getInstance().addJdk(jdk, projectRule.fixture.testRootDisposable)

            for (module in modules) {
                ModuleRootModificationUtil.setModuleSdk(module, jdk)
            }
        }

        runInEdtAndWait {
            PlatformTestUtil.saveProject(project)
            CompilerTestUtil.saveApplicationSettings()
        }
    }

    private fun setupJavaProject() {
        projectRule as HeavyJavaCodeInsightTestFixtureRule
        val module = projectRule.fixture.addModule("main")

        val utilsClass = projectRule.fixture.addClass(
            module,
            """
            package com.example;

            import java.io.BufferedInputStream;
            import java.util.concurrent.CompletableFuture;
            import java.util.concurrent.TimeUnit;
            import java.util.zip.ZipInputStream;

            public class Utils {
                public int add(int a, int b) {
                    return a + b;
                }
                
                public int sub(int a, int b) {
                    return a - b;
                }
            }            
            """.trimIndent()
        )
        utilsJava = utilsClass.containingFile.virtualFile
        totalSize += utilsJava.length
        totalLines += utilsJava.toNioPath().toFile().readLines().size

        val test1Class = projectRule.fixture.addClass(
            module,
            """
            package com.example2;
            
            import com.example.Utils;
            
            public class Test1 {
                Utils utils = new Utils();
                
                public int fib(int n) {
                   if (n == 0 || n == 1) {
                      return n; 
                   }
                  return utils.add(fib(utils.sub(n,1)), fib(utils.sub(n,2)));
                }
                
                /**
                * Bubble sort algorithm to sort integer array.
                */
                public void bubbleSort(int[] arr) {  
                    int n = arr.length;  
                    int temp;  
                    for(int i=0; i < n; i++) {
                         for(int j=1; j < (n-i); j++) {
                             if(arr[j-1] > arr[j]) {
                                 //swap elements
                                 temp = arr[j-1];
                                 arr[j-1] = arr[j];  
                                 arr[j] = temp;
                             }
                         }
                    }
                }  
            }
            
            """.trimIndent()
        )
        test1Java = test1Class.containingFile.virtualFile
        totalSize += test1Java.length
        totalLines += test1Java.toNioPath().toFile().readLines().size

        val test2Class = projectRule.fixture.addClass(
            module,
            """
            package com.example2;
            
            import com.example.*;
            
            public class Test2 {
                private Utils utils = new Utils();
                
                int fib(int n) {
                   if (n == 0 || n == 1) {
                      return n; 
                   }
                  return utils.add(fib(utils.sub(n,1)), fib(utils.sub(n,2)));
                }
            }
            """.trimIndent()
        )
        test2Java = test2Class.containingFile.virtualFile
        totalSize += test2Java.length
        totalLines += test2Java.toNioPath().toFile().readLines().size

        // Adding gitignore file and gitignore file member for testing.
        projectRule.fixture.addFileToProject("/.gitignore", "node_modules\n.idea\n.vscode\n.DS_Store").virtualFile
        projectRule.fixture.addFileToProject("test.idea", "ref: refs/heads/main")

        compileProject()
        val moduleFilePath = module.moduleFilePath
        val javaModule = File(moduleFilePath)
        moduleFile = LocalFileSystem.getInstance().findFileByIoFile(javaModule) ?: error("Failed to find module file")
        totalSize += moduleFile.length
        totalLines += moduleFile.toNioPath().toFile().readLines().size
    }
}
